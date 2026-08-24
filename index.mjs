import express from "express";
import session from "express-session";
import MySQLStore from "express-mysql-session";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import ItemDisplay from "./public/js/itemdisplay.js";
import MagicItemEngine from "./public/js/generatorcore.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Set to have req.protocol report https rather than http
app.set("trust proxy", 1);

// D&D API base
const DND_API_BASE = "https://www.dnd5eapi.co/api/2014";

// in memory cache for SRD API responses so as to reduce the
// number of calls to the api. Calls once per render startup. 
const srdCache = new Map();

async function fetchFromSRD(endpoint) {
    if (srdCache.has(endpoint)) {
        return srdCache.get(endpoint);
    }

    const response = await fetch(`${DND_API_BASE}${endpoint}`);

    if (!response.ok) {
        // Dont cache a failed request
        const err = new Error(`SRD API request failed: ${endpoint} (${response.status})`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    srdCache.set(endpoint, data);
    return data;
}

// __dirname doesnt exist in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MySQLSessionStore = MySQLStore(session);

const sessionStore = new MySQLSessionStore(
    {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        createDatabaseTable: true
    }
);

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10
});

app.use(session({
    key: "magic_item_session",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

function requireGuest(req, res, next) {
    if (req.session.user) {
        return res.redirect("/");
    }
    next();
}

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

// -- Routes --

// Home page
app.get("/", (req, res) => {
    res.render("index", {
        title: "Magic Item Generator",
        user: req.session.user || null
    });
});

// Register page
app.get("/register", requireGuest, (req, res) => {
    res.render("register", { 
        title: "Register",
        error: null 
    });
});

// Basic email format 
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Register post route
app.post("/register", requireGuest, async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
        return res.render("register", {
            title: "Register",
            error: "All fields are required." 
        });
    }

    if (!EMAIL_PATTERN.test(email)) {
        return res.render("register", {
            title: "Register",
            error: "Please enter a valid email format."
        });
    }

    try {
        const [existing] = await db.query(
            "SELECT id, username, email FROM users WHERE username = ? OR email = ?",
            [username, email]
        );

        if (existing.length > 0) {
            // Check for taken username
            const usernameTaken = existing.some(row => row.username === username);
            if (usernameTaken) {
                return res.render("register", { title: "Register", error: "Username already exists." });
            }
            return res.render("register", { title: "Register", error: "An account with that email already exists." });
            
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [username, email, passwordHash, "user"]
        );

        req.session.user = {
            id: result.insertId,
            username,
            role: "user"
        };

        req.session.save(() => {
            res.redirect("/");
        });
    } catch (err) {
        console.error(err);
        res.render("register", { title: "Register", error: "Something went wrong." });
    }
});

// Login page
app.get("/login", requireGuest, (req, res) => {
    res.render("login", { 
        title: "Login",
        error: null 
    });
});

// Login post route
app.post("/login", requireGuest, async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (rows.length === 0) {
            return res.render("login", { title: "Login", error: "Invalid credentials." });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.render("login", { title: "Login", error: "Invalid credentials." });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        req.session.save(() => {
            res.redirect("/");
        });
    } catch (err) {
        console.error(err);
        res.render("login", { title: "Login", error: "Something went wrong." });
    }
});

// Logout post route
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.redirect("/");
        }

        res.clearCookie("magic_item_session");
        res.redirect("/");
    });
});

// Collection page
app.get("/collection", requireLogin, (req, res) => {
    res.render("collection", {
        title: "Collection",
        user: req.session.user
    });
});

// Generate an item server side. 
// The client only ever sends the users choices
app.post("/api/generate", async (req, res) => {
    const { itemType, itemIndex, prefixForced, prefixValue, suffixForced, suffixValue } = req.body;

    try {
        // Resolve item type
        const resolvedType = (itemType === "weapon" || itemType === "armor")
            ? itemType
            : (Math.random() < 0.5 ? "weapon" : "armor");

        // Resolve which specific base item to use
        const listEndpoint = resolvedType === "weapon" ? "/equipment-categories/weapon" : "/equipment-categories/armor";
        const listData = await fetchFromSRD(listEndpoint);
        const baseList = listData.equipment.filter(item => item.url.includes("/equipment/"));

        let selectedIndex = (itemIndex && itemIndex !== "random") ? itemIndex : null;
        if (!selectedIndex) {
            selectedIndex = baseList[Math.floor(Math.random() * baseList.length)]?.index;
        }

        // Confirm the requested index is actually valid for this item type
        if (!baseList.some(item => item.index === selectedIndex)) {
            return res.status(400).json({ error: "Invalid item selection." });
        }

        const baseItem = await fetchFromSRD(`/equipment/${selectedIndex}`);

        // Affixes come from the DB
        const [affixes] = await db.query("SELECT * FROM affixes");

        const generatedItem = MagicItemEngine.generateMagicItem({
            baseItem,
            itemType: resolvedType,
            affixes,
            prefixForced: Boolean(prefixForced),
            prefixValue,
            suffixForced: Boolean(suffixForced),
            suffixValue,
        });

        // Remember what was generated so /api/items/save can trust
        // it later without needing to revalidat what the client sends
        req.session.lastGeneratedItem = generatedItem;

        res.json(generatedItem);
    } catch (err) {
        console.error("Generation failed:", err);
        res.status(500).json({ error: "Failed to generate item." });
    }
});

// Save item to collection
app.post("/api/items/save", requireLogin, async (req, res) => {
    const item = req.session.lastGeneratedItem; //use the stored generated item

    if (!item || !item.name) {
        return res.status(400).json({ error: "No item to save." });
    }

    try {
        const shareToken = crypto.randomBytes(6).toString("hex");

        await db.query(
            "INSERT INTO user_items (user_id, item_name, item_data, saved_at, share_token) VALUES (?, ?, ?, NOW(), ?)",
            [req.session.user.id, item.name, JSON.stringify(item), shareToken]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Save item failed:", err);
        res.status(500).json({ error: "Failed to save item." });
    }
});

// Save a copy of a publicly shared item to your own collection.
app.post("/api/items/collection/copy/:token", requireLogin, async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT item_name, item_data, item_description FROM user_items WHERE share_token = ?",
            [req.params.token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Item not found." });
        }

        const source = rows[0];
        const shareToken = crypto.randomBytes(6).toString("hex");

        await db.query(
            "INSERT INTO user_items (user_id, item_name, item_data, item_description, saved_at, share_token) VALUES (?, ?, ?, ?, NOW(), ?)",
            [req.session.user.id, source.item_name, JSON.stringify(source.item_data), source.item_description, shareToken]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Copy item failed:", err);
        res.status(500).json({ error: "Failed to save item." });
    }
});

// Generate or retrieve share token for an item
app.post("/api/items/collection/:id/share", requireLogin, async (req, res) => {
    try {
        // Check the item belongs to this user
        const [rows] = await db.query(
            "SELECT id, item_name, share_token FROM user_items WHERE id = ? AND user_id = ?",
            [req.params.id, req.session.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Item not found." });
        }

        let { share_token } = rows[0];

        // Only generate a token if it doesnt already exist
        if (!share_token) {
            share_token = crypto.randomBytes(6).toString("hex"); // 12 char hex string
            await db.query(
                "UPDATE user_items SET share_token = ? WHERE id = ?",
                [share_token, req.params.id]
            );
        }

        res.json({ token: share_token });
    } catch (err) {
        console.error("Share token generation failed:", err);
        res.status(500).json({ error: "Failed to generate share link." });
    }
});

// Public item view page
app.get("/item/:token", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, user_id, item_name, item_data, item_description, saved_at FROM user_items WHERE share_token = ?",
            [req.params.token]
        );

        if (rows.length === 0) {
            return res.status(404).render("404", { title: "Item Not Found", user: req.session.user || null });
        }

        const row = rows[0];
        const isOwner = Boolean(req.session.user && req.session.user.id === row.user_id);

        res.render("item", {
            title: row.item_name,
            user: req.session.user || null,
            item: row.item_data,
            rarity: ItemDisplay.getRarity(row.item_data),
            baseTypeName: row.item_data.baseItem?.name ? ItemDisplay.normalizeBaseName(row.item_data.baseItem.name) : "",
            saved_at: row.saved_at,
            itemId: row.id,
            isOwner,
            description: row.item_description || "",
            shareUrl: `${req.protocol}://${req.get("host")}/item/${req.params.token}`
        });
    } catch (err) {
        console.error("Item view failed:", err);
        res.status(500).send("Failed to load item.");
    }
});

// Get weapons
app.get("/api/items/weapons", async (req, res) => {
    try {
        const data = await fetchFromSRD("/equipment-categories/weapon");
        const baseOnly = data.equipment.filter(item => item.url.includes("/equipment/"));
        res.json(baseOnly);
    } catch (err) {
        console.error("Weapon fetch failed:", err);
        res.status(500).json({ error: "Failed to fetch weapons" });
    }
});

// Get armor
app.get("/api/items/armor", async (req, res) => {
    try {
        const data = await fetchFromSRD("/equipment-categories/armor");
        const baseOnly = data.equipment.filter(item => item.url.includes("/equipment/"));
        res.json(baseOnly);
    } catch (err) {
        console.error("Armor fetch failed:", err);
        res.status(500).json({ error: "Failed to fetch armor" });
    }
});

// Get item data
app.get("/api/items/detail/:index", async (req, res) => {
    try {
        const data = await fetchFromSRD(`/equipment/${req.params.index}`);
        res.json(data);
    } catch (err) {
        if (err.status === 404) {
            return res.status(404).json({ error: "Item not found" });
        }
        console.error("Item detail fetch failed:", err);
        res.status(500).json({ error: "Failed to fetch item detail" });
    }
});

app.get("/api/affixes", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM affixes");
        res.json(rows);
    } catch (err) {
        console.error("Affix fetch failed:", err);
        res.status(500).json({ error: "Failed to fetch affixes" });
    }
});

// Get user saved items
app.get("/api/items/collection", requireLogin, async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, item_name, item_data, saved_at, share_token FROM user_items WHERE user_id = ? ORDER BY saved_at DESC",
            [req.session.user.id]
        );

        const items = rows.map(row => ({
            id: row.id,
            item_name: row.item_name,
            saved_at: row.saved_at,
            share_token: row.share_token,
            ...row.item_data
        }));

        res.json(items);
    } catch (err) {
        console.error("Collection fetch failed:", err);
        res.status(500).json({ error: "Failed to fetch collection." });
    }
});

// Delete a saved item
app.delete("/api/items/collection/:id", requireLogin, async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM user_items WHERE id = ? AND user_id = ?",
            [req.params.id, req.session.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Item not found." });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Delete failed:", err);
        res.status(500).json({ error: "Failed to delete item." });
    }
});

// Edit saved items name/description. owner only
app.patch("/api/items/collection/:id", requireLogin, async (req, res) => {
    const { name, description } = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedDescription = typeof description === "string" ? description.trim() : "";

    if (!trimmedName) {
        return res.status(400).json({ error: "Name cannot be empty." });
    }

    if (trimmedName.length > 150) {
        return res.status(400).json({ error: "Name is too long." });
    }

    if (trimmedDescription.length > 1000) {
        return res.status(400).json({ error: "Description is too long." });
    }

    try {
        // Confirm owner and pull the current item_data so its embedded
        const [rows] = await db.query(
            "SELECT item_data FROM user_items WHERE id = ? AND user_id = ?",
            [req.params.id, req.session.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Item not found." });
        }

        const itemData = rows[0].item_data;
        itemData.name = trimmedName;

        await db.query(
            "UPDATE user_items SET item_name = ?, item_data = ?, item_description = ? WHERE id = ? AND user_id = ?",
            [trimmedName, JSON.stringify(itemData), trimmedDescription, req.params.id, req.session.user.id]
        );

        res.json({ success: true, name: trimmedName, description: trimmedDescription });
    } catch (err) {
        console.error("Item edit failed:", err);
        res.status(500).json({ error: "Failed to save changes." });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});