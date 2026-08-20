import express from "express";
import session from "express-session";
import MySQLStore from "express-mysql-session";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// D&D API base
const DND_API_BASE = "https://www.dnd5eapi.co/api/2014";

// Needed because __dirname doesn't exist in ES modules
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

// Register post route
app.post("/register", requireGuest, async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
        return res.render("register", {
            error: "All fields are required." 
        });
    }

    try {
        const [existing] = await db.query(
            "SELECT id FROM users WHERE username = ?",
            [username]
        );

        if (existing.length > 0) {
            return res.render("register", { error: "Username already exists." });
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
        res.render("register", { error: "Something went wrong." });
    }
});

// Login page
app.get("/login", requireGuest, (req, res) => {
    res.render("login", { 
        title: "Register",
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
            return res.render("login", { error: "Invalid credentials." });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.render("login", { error: "Invalid credentials." });
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
        res.render("login", { error: "Something went wrong." });
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

// Generate item
app.post("/generate", async (req, res) => {
  try {
    const result = await generateItem(req.body);

    res.render("index", {
      user: req.session.user,
      generatedItem: result
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Item generation failed");
  }
});

// Save item to collection
app.post("/api/items/save", requireLogin, async (req, res) => {
    const { item } = req.body;

    if (!item || !item.name) {
        return res.status(400).json({ error: "Invalid item data." });
    }

    try {
        await db.query(
            "INSERT INTO user_items (user_id, item_name, item_data, saved_at) VALUES (?, ?, ?, NOW())",
            [req.session.user.id, item.name, JSON.stringify(item)]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Save item failed:", err);
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
            "SELECT item_name, item_data, saved_at FROM user_items WHERE share_token = ?",
            [req.params.token]
        );

        if (rows.length === 0) {
            return res.status(404).render("404", { title: "Item Not Found", user: req.session.user || null });
        }

        res.render("item", {
            title: rows[0].item_name,
            user: req.session.user || null,
            item: rows[0].item_data,
            saved_at: rows[0].saved_at
        });
    } catch (err) {
        console.error("Item view failed:", err);
        res.status(500).send("Failed to load item.");
    }
});

// Get weapons
app.get("/api/items/weapons", async (req, res) => {
    try {
        const response = await fetch(`${DND_API_BASE}/equipment-categories/weapon`);
        const data = await response.json();
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
        const response = await fetch(`${DND_API_BASE}/equipment-categories/armor`);
        const data = await response.json();
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
        const response = await fetch(`${DND_API_BASE}/equipment/${req.params.index}`);
        if (!response.ok) {
            return res.status(404).json({ error: "Item not found" });
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
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
            "SELECT id, item_name, item_data, saved_at FROM user_items WHERE user_id = ? ORDER BY saved_at DESC",
            [req.session.user.id]
        );

        const items = rows.map(row => ({
            id: row.id,
            item_name: row.item_name,
            saved_at: row.saved_at,
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

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});