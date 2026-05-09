const state = {
  prices: [],
  filtered: [],
  chart: null,
  toastTimer: null,
  selectedProducts: new Set(),
  selectionInitialized: false
};

const form = document.querySelector("#price-form");
const rowsTarget = document.querySelector("#price-rows");
const emptyState = document.querySelector("#empty-state");
const formError = document.querySelector("#form-error");
const brandFilter = document.querySelector("#filter-brand");
const signalReadout = document.querySelector("#signal-readout");
const selectAllProducts = document.querySelector("#select-all-products");

const filters = {
  q: document.querySelector("#search-q"),
  type: document.querySelector("#filter-type"),
  brand: document.querySelector("#filter-brand"),
  module: document.querySelector("#filter-module"),
  min: document.querySelector("#filter-min"),
  max: document.querySelector("#filter-max")
};

const currency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0
});

document.querySelector("#date").valueAsDate = new Date();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";

  const payload = Object.fromEntries(new FormData(form).entries());
  payload.price = Number(payload.price);
  payload.capacity_gb = payload.capacity_gb ? payload.capacity_gb.trim() : null;

  try {
    const response = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((result.errors || [result.error]).filter(Boolean).join("、") || "新增失敗");

    resetPriceForm();
    await loadPrices();
    pulseSignal();
    showToast("價格資料已寫入，圖表與表格已更新");
  } catch (error) {
    formError.textContent = error.message;
  }
});

document.querySelector("#fetch-pchome").addEventListener("click", async () => {
  const sourceUrl = document.querySelector("#source_url").value.trim();
  formError.textContent = "";

  if (!sourceUrl) {
    formError.textContent = "請先貼上 PChome 商品網址";
    return;
  }

  try {
    const response = await fetch("/api/fetch-pchome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrl })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "抓取失敗");

    document.querySelector("#product_name").value = result.product_name || "";
    document.querySelector("#price").value = result.price || "";
    document.querySelector("#source_url").value = result.source_url || sourceUrl;
    document.querySelector("#brand").value = result.brand || "";
    document.querySelector("#memory_type").value = result.memory_type || "DDR5";
    document.querySelector("#capacity_gb").value = result.capacity_gb || "";
    document.querySelector("#module_type").value = result.module_type || "桌上型";
    showToast("已嘗試從 PChome 帶入商品名稱與價格");
  } catch (error) {
    formError.textContent = error.message;
  }
});

document.querySelector("#fetch-twbuyers").addEventListener("click", async () => {
  const sourceUrl = document.querySelector("#source_url").value.trim();
  const months = Number(document.querySelector("#twbuyers-months").value || 12);
  const payload = Object.fromEntries(new FormData(form).entries());
  formError.textContent = "";

  if (!sourceUrl) {
    formError.textContent = "請先貼上 PChome 商品網址";
    return;
  }

  try {
    const response = await fetch("/api/fetch-twbuyers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, url: sourceUrl, months })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "匯入失敗");

    document.querySelector("#product_name").value = result.product_name || "";
    document.querySelector("#price").value = result.latest_price || "";
    document.querySelector("#date").value = result.latest_date || document.querySelector("#date").value;
    document.querySelector("#brand").value = result.brand || "";
    document.querySelector("#memory_type").value = result.memory_type || "DDR5";
    document.querySelector("#capacity_gb").value = result.capacity_gb || "";
    document.querySelector("#module_type").value = result.module_type || "桌上型";
    document.querySelector("#source_url").value = result.source_url || sourceUrl;

    await loadPrices();
    resetPriceForm();
    pulseSignal();
    showToast(`已匯入 ${result.imported} 筆歷史價格，略過 ${result.skipped} 筆重複資料`);
  } catch (error) {
    formError.textContent = error.message;
  }
});

Object.values(filters).forEach((input) => input.addEventListener("input", applyFilters));
selectAllProducts.addEventListener("change", () => {
  const visibleProducts = groupRowsByProduct(state.filtered).map((group) => group.productName);
  visibleProducts.forEach((productName) => {
    if (selectAllProducts.checked) {
      state.selectedProducts.add(productName);
    } else {
      state.selectedProducts.delete(productName);
    }
  });
  renderTable();
  renderChart();
});

async function loadPrices() {
  const response = await fetch("/api/prices");
  const previousProducts = new Set(state.prices.map((row) => row.product_name));
  state.prices = await response.json();
  state.prices.forEach((row) => {
    if (!state.selectionInitialized || !previousProducts.has(row.product_name)) {
      state.selectedProducts.add(row.product_name);
    }
  });
  state.selectionInitialized = true;
  syncBrandOptions();
  applyFilters();
}

function applyFilters() {
  const q = filters.q.value.trim().toLowerCase();
  const type = filters.type.value;
  const brand = filters.brand.value;
  const module = filters.module.value;
  const min = Number(filters.min.value || 0);
  const max = Number(filters.max.value || 0);

  state.filtered = state.prices.filter((row) => {
    const searchable = `${row.product_name} ${row.brand} ${getMemoryType(row)} ${getModuleType(row)}`.toLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (type && getMemoryType(row) !== type) return false;
    if (brand && row.brand !== brand) return false;
    if (module && getModuleType(row) !== module) return false;
    if (min && row.price < min) return false;
    if (max && row.price > max) return false;
    return true;
  });

  renderMetrics();
  renderTable();
  renderChart();
}

function syncBrandOptions() {
  const selected = brandFilter.value;
  const brands = [...new Set(state.prices.map((row) => row.brand).filter(Boolean))].sort();
  brandFilter.innerHTML = `<option value="">全部</option>${brands.map((brand) => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`).join("")}`;
  brandFilter.value = brands.includes(selected) ? selected : "";
}

function renderMetrics() {
  const rows = state.filtered;
  const prices = rows.map((row) => row.price);
  const average = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;

  document.querySelector("#metric-count").textContent = rows.length;
  document.querySelector("#metric-average").textContent = currency.format(Math.round(average));
  document.querySelector("#metric-low").textContent = prices.length ? currency.format(Math.min(...prices)) : currency.format(0);
  document.querySelector("#metric-high").textContent = prices.length ? currency.format(Math.max(...prices)) : currency.format(0);
  document.querySelector("#row-count").textContent = `${groupRowsByProduct(rows).length} products / ${rows.length} records`;
  renderInsights();
}

function renderInsights() {
  const rowsWithGb = state.prices.filter((row) => getCapacity(row) > 0);
  const best = rowsWithGb.slice().sort((a, b) => (a.price / getCapacity(a)) - (b.price / getCapacity(b)))[0];
  const ddr5Count = state.prices.filter((row) => getMemoryType(row) === "DDR5").length;
  const productLines = new Set(state.prices.map((row) => row.product_name)).size;

  document.querySelector("#insight-best-gb").textContent = best ? `${currency.format(best.price / getCapacity(best))}/GB` : "-";
  document.querySelector("#insight-best-product").textContent = best ? best.product_name : "尚無資料";
  document.querySelector("#insight-ddr5-count").textContent = ddr5Count;
  document.querySelector("#insight-product-lines").textContent = productLines;
}

function renderTable() {
  emptyState.hidden = state.filtered.length !== 0;
  const groups = groupRowsByProduct(state.filtered);
  syncSelectAllState(groups);
  rowsTarget.innerHTML = groups.map((group) => {
    const latest = group.rows.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
    const capacity = getCapacity(latest);
    const gbPrice = capacity ? latest.price / capacity : null;
    const source = latest.source_url ? `<a class="source-link" href="${escapeHtml(latest.source_url)}" target="_blank" rel="noreferrer">link</a>` : "-";
    const checked = state.selectedProducts.has(group.productName) ? "checked" : "";

    return `
      <tr>
        <td><input class="product-checkbox" data-product="${escapeHtml(group.productName)}" type="checkbox" ${checked} /></td>
        <td>${escapeHtml(group.productName)}<br><small>${escapeHtml(latest.brand || "未標示品牌")}${gbPrice ? ` · ${currency.format(gbPrice)}/GB` : ""}</small></td>
        <td class="number-cell">${currency.format(latest.price)}<br><small>${escapeHtml(latest.date)}</small></td>
        <td class="number-cell">${group.rows.length}</td>
        <td><span class="tag">${escapeHtml(getMemoryType(latest) || "RAM")}</span></td>
        <td><span class="tag">${escapeHtml(getModuleType(latest) || "未分類")}</span></td>
        <td>${source}</td>
        <td><button class="delete-button" data-product="${escapeHtml(group.productName)}" type="button">刪除商品</button></td>
      </tr>
    `;
  }).join("");

  rowsTarget.querySelectorAll(".delete-button").forEach((button) => {
    button.addEventListener("click", () => deleteProductRows(button.dataset.product));
  });
  rowsTarget.querySelectorAll(".product-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedProducts.add(checkbox.dataset.product);
      } else {
        state.selectedProducts.delete(checkbox.dataset.product);
      }
      syncSelectAllState(groups);
      renderChart();
    });
  });
}

function syncSelectAllState(groups) {
  const visibleProducts = groups.map((group) => group.productName);
  const checkedCount = visibleProducts.filter((productName) => state.selectedProducts.has(productName)).length;
  selectAllProducts.checked = visibleProducts.length > 0 && checkedCount === visibleProducts.length;
  selectAllProducts.indeterminate = checkedCount > 0 && checkedCount < visibleProducts.length;
}

function groupRowsByProduct(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const productName = row.product_name || "未命名商品";
    const group = groups.get(productName) || { productName, rows: [] };
    group.rows.push(row);
    groups.set(productName, group);
  });

  return [...groups.values()].sort((a, b) => {
    const latestA = a.rows.map((row) => row.date).sort().at(-1) || "";
    const latestB = b.rows.map((row) => row.date).sort().at(-1) || "";
    return latestB.localeCompare(latestA);
  });
}

async function deleteProductRows(productName) {
  const rows = state.prices.filter((row) => row.product_name === productName);
  if (!rows.length) return;
  if (!confirm(`確定要刪除「${productName}」的 ${rows.length} 筆價格資料嗎？`)) return;

  const results = await Promise.all(rows.map((row) => fetch(`/api/prices/${row.id}`, { method: "DELETE" })));
  if (results.some((response) => !response.ok)) {
    showToast("部分資料刪除失敗，請重新整理後確認");
    return;
  }

  state.selectedProducts.delete(productName);
  await loadPrices();
  showToast("商品價格資料已刪除");
}

function renderChart() {
  if (!window.Chart) return;

  const rows = state.prices
    .filter((row) => state.selectedProducts.has(row.product_name))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const labels = [...new Set(rows.map((row) => row.date))].sort();
  const productNames = [...new Set(rows.map((row) => row.product_name))].sort();
  const palette = ["#49b894", "#d8b35a", "#7aa2cc", "#c98373", "#9dbb75", "#b7a0d8", "#d18aa6"];
  const datasets = productNames.map((productName, index) => {
    const points = labels.map((date) => {
      const sameDayRows = rows.filter((row) => row.product_name === productName && row.date === date);
      if (!sameDayRows.length) return null;
      return Math.round(sameDayRows.reduce((sum, row) => sum + row.price, 0) / sameDayRows.length);
    });
    const color = palette[index % palette.length];

    return {
      label: productName,
      data: points,
      tension: 0.35,
      borderColor: color,
      backgroundColor: `${color}22`,
      fill: false,
      spanGaps: true,
      pointRadius: 4,
      pointHoverRadius: 6
    };
  });

  const context = document.querySelector("#price-chart");
  if (state.chart) state.chart.destroy();
  document.querySelector("#chart-selected-count").textContent = `${productNames.length} selected`;

  state.chart = new Chart(context, {
    type: "line",
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#c6d3ce", font: { family: "JetBrains Mono" } } }
      },
      scales: {
        x: { ticks: { color: "#8c9b96" }, grid: { color: "rgba(180, 210, 202, 0.08)" } },
        y: { ticks: { color: "#8c9b96" }, grid: { color: "rgba(180, 210, 202, 0.08)" } }
      }
    }
  });
}

function pulseSignal() {
  signalReadout.textContent = "WRITE";
  window.dispatchEvent(new CustomEvent("ram-pulse"));
  setTimeout(() => {
    signalReadout.textContent = "IDLE";
  }, 1300);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function resetPriceForm() {
  form.reset();
  document.querySelector("#date").valueAsDate = new Date();
  document.querySelector("#memory_type").value = "DDR5";
  document.querySelector("#module_type").value = "桌上型";
  document.querySelector("#twbuyers-months").value = "12";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeType(value) {
  return String(value || "").trim().toUpperCase();
}

function getMemoryType(row) {
  const fromName = String(row.product_name || "").match(/DDR\s*([345])/i);
  return fromName ? `DDR${fromName[1]}` : normalizeType(row.memory_type);
}

function getCapacity(row) {
  const saved = parseCapacity(row.capacity_gb);
  if (saved > 0) return saved;

  return parseCapacity(row.product_name);
}

function parseCapacity(value) {
  const text = String(value || "");
  const multiplied = text.match(/(8|16|24|32|48|64)\s*[x*×]\s*(2|4|8)/i);
  if (multiplied) return Number(multiplied[1]) * Number(multiplied[2]);

  const normal = text.match(/(8|16|24|32|48|64|96|128)\s*GB?/i) || text.match(/^(8|16|24|32|48|64|96|128)$/);
  return normal ? Number(normal[1]) : 0;
}

function getModuleType(row) {
  const saved = String(row.module_type || "").trim();
  if (saved) return saved;

  const name = String(row.product_name || "");
  if (/筆記型|notebook|laptop|sodimm|so-dimm/i.test(name)) return "筆記型";
  if (/桌上型|desktop|dimm/i.test(name)) return "桌上型";
  return "";
}

loadPrices().catch(() => showToast("無法載入資料，請確認後端伺服器已啟動"));
