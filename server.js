const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cheerio = require("cheerio");

const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "data.db");
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const seedRows = [
  ["2026-05-01", "Kingston FURY Beast DDR5 6000 32GB", 13482, "Kingston", "DDR5", 32, "https://24h.pchome.com.tw/"],
  ["2026-05-03", "ADATA XPG Lancer Blade DDR5 5600 16GB", 6599, "ADATA", "DDR5", 16, "https://24h.pchome.com.tw/"],
  ["2026-05-05", "Crucial DDR5 5600 32GB", 13229, "Crucial", "DDR5", 32, "https://24h.pchome.com.tw/"],
  ["2026-05-07", "UMAX DDR4 2666 16GB 筆記型記憶體", 4450, "UMAX", "DDR4", 16, "https://24h.pchome.com.tw/"]
];

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      brand TEXT,
      memory_type TEXT,
      capacity_gb INTEGER,
      module_type TEXT,
      source_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run("ALTER TABLE prices ADD COLUMN module_type TEXT", (error) => {
    if (error && !String(error.message).includes("duplicate column name")) {
      console.error("Failed to add module_type column", error);
    }
  });

  db.get("SELECT COUNT(*) AS count FROM prices", (error, row) => {
    if (error) {
      console.error("Failed to check seed data", error);
      return;
    }

    if (row.count > 0) return;

    const statement = db.prepare(`
      INSERT INTO prices (date, product_name, price, brand, memory_type, capacity_gb, module_type, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    seedRows.forEach((entry) => statement.run([...entry.slice(0, 6), inferModuleType(entry[1]), entry[6]]));
    statement.finalize();
  });
});

function validatePricePayload(body) {
  const errors = [];
  const price = Number(body.price);
  const inferredCapacity = inferCapacity(body.product_name);
  const inferredMemoryType = inferMemoryType(body.product_name);
  const inferredModuleType = inferModuleType(body.product_name);
  const capacity = body.capacity_gb === "" || body.capacity_gb == null ? inferredCapacity : parseCapacity(body.capacity_gb);
  const memoryType = inferredMemoryType || body.memory_type || "";
  const moduleType = body.module_type || inferredModuleType;

  if (!body.date) errors.push("請輸入日期");
  if (!body.product_name || !String(body.product_name).trim()) errors.push("請輸入商品名稱");
  if (!Number.isInteger(price) || price <= 0) errors.push("價格必須是大於 0 的整數");
  if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) errors.push("容量必須是大於 0 的整數");
  if (memoryType && !["DDR3", "DDR4", "DDR5"].includes(memoryType)) errors.push("類型只能是 DDR3、DDR4 或 DDR5");

  return { errors, price, capacity, memoryType, moduleType };
}

function inferMemoryType(productName) {
  const match = String(productName || "").match(/DDR\s*([345])/i);
  return match ? `DDR${match[1]}` : "";
}

function inferCapacity(productName) {
  return parseCapacity(productName) || null;
}

function parseCapacity(value) {
  const text = String(value || "");
  const multiplied = text.match(/(8|16|24|32|48|64)\s*[x*×]\s*(2|4|8)/i);
  if (multiplied) return Number(multiplied[1]) * Number(multiplied[2]);

  const normal = text.match(/(8|16|24|32|48|64|96|128)\s*GB?/i) || text.match(/^(8|16|24|32|48|64|96|128)$/);
  return normal ? Number(normal[1]) : null;
}

function inferBrand(productName) {
  const brands = ["Kingston", "ADATA", "Crucial", "Micron", "TEAM", "Transcend", "UMAX", "Corsair", "G.SKILL"];
  const name = String(productName || "").toLowerCase();
  return brands.find((brand) => name.includes(brand.toLowerCase())) || "";
}

function inferModuleType(productName) {
  const name = String(productName || "");
  if (/筆記型|notebook|laptop|sodimm|so-dimm/i.test(name)) return "筆記型";
  if (/桌上型|desktop|dimm/i.test(name)) return "桌上型";
  return "";
}

function normalizeRow(row) {
  return {
    ...row,
    gb_price: row.capacity_gb ? Math.round((row.price / row.capacity_gb) * 10) / 10 : null
  };
}

app.get("/api/prices", (req, res) => {
  db.all("SELECT * FROM prices ORDER BY date DESC, id DESC", (error, rows) => {
    if (error) return res.status(500).json({ error: "無法讀取價格資料" });
    res.json(rows.map(normalizeRow));
  });
});

app.get("/api/prices/search", (req, res) => {
  const q = `%${String(req.query.q || "").trim()}%`;
  const memoryType = String(req.query.memory_type || "").trim();
  const brand = String(req.query.brand || "").trim();
  const minPrice = Number(req.query.min_price || 0);
  const maxPrice = Number(req.query.max_price || 0);
  const params = [q, q];
  const where = ["(product_name LIKE ? OR brand LIKE ?)"];

  if (memoryType) {
    where.push("memory_type = ?");
    params.push(memoryType);
  }

  if (brand) {
    where.push("brand = ?");
    params.push(brand);
  }

  if (minPrice > 0) {
    where.push("price >= ?");
    params.push(minPrice);
  }

  if (maxPrice > 0) {
    where.push("price <= ?");
    params.push(maxPrice);
  }

  db.all(`SELECT * FROM prices WHERE ${where.join(" AND ")} ORDER BY date DESC, id DESC`, params, (error, rows) => {
    if (error) return res.status(500).json({ error: "搜尋失敗" });
    res.json(rows.map(normalizeRow));
  });
});

app.post("/api/prices", (req, res) => {
  const { errors, price, capacity, memoryType, moduleType } = validatePricePayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const params = [
    req.body.date,
    String(req.body.product_name).trim(),
    price,
    String(req.body.brand || "").trim(),
    memoryType,
    capacity,
    moduleType,
    String(req.body.source_url || "").trim()
  ];

  db.run(
    `INSERT INTO prices (date, product_name, price, brand, memory_type, capacity_gb, module_type, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params,
    function insertPrice(error) {
      if (error) return res.status(500).json({ error: "新增資料失敗" });
      db.get("SELECT * FROM prices WHERE id = ?", [this.lastID], (selectError, row) => {
        if (selectError) return res.status(500).json({ error: "新增成功但讀取失敗" });
        res.status(201).json(normalizeRow(row));
      });
    }
  );
});

app.delete("/api/prices/:id", (req, res) => {
  db.run("DELETE FROM prices WHERE id = ?", [req.params.id], function deletePrice(error) {
    if (error) return res.status(500).json({ error: "刪除失敗" });
    if (this.changes === 0) return res.status(404).json({ error: "找不到資料" });
    res.status(204).end();
  });
});

app.post("/api/fetch-pchome", async (req, res) => {
  const url = String(req.body.url || "").trim();
  if (!/^https:\/\/24h\.pchome\.com\.tw\//.test(url)) {
    return res.status(400).json({ error: "請輸入 PChome 24h 商品網址" });
  }

  try {
    const productId = url.match(/\/prod\/([A-Z0-9]+)/i)?.[1];

    if (productId) {
      const apiUrl = `https://ecapi-cdn.pchome.com.tw/ecshop/prodapi/v2/prod?id=${productId}&fields=Id,Name,Price`;
      const apiResponse = await fetch(apiUrl, {
        headers: { "user-agent": "Mozilla/5.0 RAM Pulse Homework Price Tracker" }
      });

      if (apiResponse.ok) {
        const productData = await apiResponse.json();
        const product = Object.values(productData)[0];
        const price = Number(product?.Price?.Low || product?.Price?.P || product?.Price?.M || 0);

        if (product?.Name && price > 0) {
          return res.json({
            product_name: String(product.Name).trim(),
            price,
            brand: inferBrand(product.Name),
            memory_type: inferMemoryType(product.Name),
            capacity_gb: inferCapacity(product.Name),
            module_type: inferModuleType(product.Name),
            source_url: url
          });
        }
      }
    }

    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 RAM Pulse Homework Price Tracker" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const title = $("meta[property='og:title']").attr("content") || $("title").text();
    const priceText = $("script[type='application/ld+json']").text().match(/"price"\s*:\s*"?([0-9,]+)/)?.[1];

    if (!title || !priceText) {
      return res.status(422).json({ error: "無法自動解析商品名稱或價格，請手動輸入" });
    }

    res.json({
      product_name: title.replace(/PChome 24h購物|｜.*$/g, "").trim(),
      price: Number(priceText.replace(/,/g, "")),
      brand: inferBrand(title),
      memory_type: inferMemoryType(title),
      capacity_gb: inferCapacity(title),
      module_type: inferModuleType(title),
      source_url: url
    });
  } catch (error) {
    res.status(502).json({ error: "無法連線或解析 PChome 頁面，請手動輸入" });
  }
});

app.post("/api/fetch-twbuyers", async (req, res) => {
  const url = String(req.body.url || "").trim();
  const months = Math.min(Math.max(Number(req.body.months || 12), 1), 36);

  if (!/^https:\/\/(24h\.)?pchome\.com\.tw\//.test(url)) {
    return res.status(400).json({ error: "請輸入 PChome 商品網址" });
  }

  try {
    const response = await fetch("https://api.twbuyers.info/search-v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": "Mozilla/5.0 RAM Pulse Homework Price Tracker"
      },
      body: JSON.stringify({ url, months })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data || !data.name || !Array.isArray(data.prices) || data.prices.length === 0) {
      return res.status(422).json({ error: "TWBuyers 查無歷史價格資料" });
    }

    const apiProductName = String(data.name).trim();
    const productName = String(req.body.product_name || "").trim() || apiProductName;
    const memoryType = req.body.memory_type || inferMemoryType(productName) || inferMemoryType(apiProductName);
    const capacity = req.body.capacity_gb === "" || req.body.capacity_gb == null ? (inferCapacity(productName) || inferCapacity(apiProductName)) : parseCapacity(req.body.capacity_gb);
    const brand = String(req.body.brand || "").trim() || inferBrand(productName) || inferBrand(apiProductName);
    const moduleType = req.body.module_type || inferModuleType(productName) || inferModuleType(apiProductName);
    const sourceUrl = String(data.url || url).trim();
    const normalizedPrices = data.prices
      .map(([price, timestamp]) => ({
        date: String(timestamp || "").slice(0, 10),
        price: Number(price)
      }))
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isInteger(entry.price) && entry.price > 0);

    if (normalizedPrices.length === 0) {
      return res.status(422).json({ error: "TWBuyers 回傳資料無法轉成價格紀錄" });
    }

    let inserted = 0;
    let skipped = 0;

    await Promise.all(normalizedPrices.map((entry) => new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM prices WHERE date = ? AND product_name = ? AND price = ? AND source_url = ?`,
        [entry.date, productName, entry.price, sourceUrl],
        (selectError, row) => {
          if (selectError) return reject(selectError);
          if (row) {
            skipped += 1;
            return resolve();
          }

          db.run(
            `INSERT INTO prices (date, product_name, price, brand, memory_type, capacity_gb, module_type, source_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [entry.date, productName, entry.price, brand, memoryType, capacity, moduleType, sourceUrl],
            (insertError) => {
              if (insertError) return reject(insertError);
              inserted += 1;
              resolve();
            }
          );
        }
      );
    })));

    res.json({
      product_name: productName,
      source_url: sourceUrl,
      brand,
      memory_type: memoryType,
      capacity_gb: capacity,
      module_type: moduleType,
      imported: inserted,
      skipped,
      total: normalizedPrices.length,
      latest_price: normalizedPrices[normalizedPrices.length - 1]?.price || null,
      latest_date: normalizedPrices[normalizedPrices.length - 1]?.date || null
    });
  } catch (error) {
    res.status(502).json({ error: "無法連線或解析 TWBuyers API" });
  }
});

app.listen(port, () => {
  console.log(`RAM Pulse running at http://localhost:${port}`);
});
