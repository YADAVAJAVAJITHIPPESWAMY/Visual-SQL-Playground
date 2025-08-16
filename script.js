// --- State ---
let rawRows = [];      // [{Region, Sales, Rep}, ...]
let columns = [];      // ["Region","Sales","Rep"]
const state = {
  select: ["Region"],  // display columns
  agg: { fn: "SUM", col: "Sales" }, // optional aggregate
  filters: [],         // [{col, op, val}]
  groupBy: [],         // ["Region"]
  orderBy: { col: "SUM(Sales)", dir: "desc" }, // later resolved
};

// --- Helpers ---
const $ = sel => document.querySelector(sel);

function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const header = lines[0].split(",").map(s => s.trim());
  const data = lines.slice(1).map(line => {
    const cells = line.split(",").map(s => s.trim());
    const obj = {};
    header.forEach((h, i) => obj[h] = coerce(cells[i]));
    return obj;
  });
  return { header, data };
}

function coerce(v) {
  if (v === undefined) return "";
  if (v === "") return "";
  const n = Number(v);
  if (!isNaN(n) && v.match(/^-?\d+(\.\d+)?$/)) return n;
  return v;
}

function renderColumns() {
  const box = $("#columns");
  box.innerHTML = "";
  columns.forEach(col => {
    const el = document.createElement("div");
    el.className = "pill";
    el.textContent = col;
    const btn = document.createElement("button");
    btn.textContent = "+ Select";
    btn.onclick = () => {
      if (!state.select.includes(col)) state.select.push(col);
      update();
    };
    el.appendChild(btn);
    box.appendChild(el);
  });
  // fill selects
  for (const sel of ["#aggColumn","#filterCol","#groupByCol","#orderByCol"]) {
    const s = $(sel);
    s.innerHTML = "";
    columns.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      s.appendChild(opt);
    });
  }
}

function addFilter(col, op, val) {
  state.filters.push({ col, op, val });
  update();
}

function removeFilter(idx) {
  state.filters.splice(idx, 1);
  update();
}

function addGroup(col) {
  if (!state.groupBy.includes(col)) state.groupBy.push(col);
  update();
}

function removeGroup(idx) {
  state.groupBy.splice(idx, 1);
  update();
}

// --- Query Engine ---
function applyFilters(rows, filters) {
  return rows.filter(r => {
    return filters.every(f => {
      const a = r[f.col];
      const b = coerce(f.val);
      switch (f.op) {
        case "eq": return a === b;
        case "neq": return a !== b;
        case "gt": return typeof a === "number" && a > Number(b);
        case "lt": return typeof a === "number" && a < Number(b);
        case "contains": return String(a).toLowerCase().includes(String(b).toLowerCase());
      }
    });
  });
}

function groupAndAggregate(rows, groupBy, agg) {
  const keyFn = r => groupBy.map(g => r[g]).join("│");
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const out = [];
  for (const [k, arr] of map.entries()) {
    const obj = {};
    groupBy.forEach((g, i) => obj[g] = k.split("│")[i]);
    if (agg && agg.fn && agg.col) {
      const nums = arr.map(x => Number(x[agg.col])).filter(x => !isNaN(x));
      let val = null;
      if (agg.fn === "COUNT") val = arr.length;
      if (agg.fn === "SUM") val = nums.reduce((a, c) => a + c, 0);
      if (agg.fn === "AVG") val = nums.length ? nums.reduce((a, c) => a + c, 0) / nums.length : 0;
      if (agg.fn === "MIN") val = nums.length ? Math.min(...nums) : null;
      if (agg.fn === "MAX") val = nums.length ? Math.max(...nums) : null;
      obj[`${agg.fn}(${agg.col})`] = round(val);
    }
    out.push(obj);
  }
  return out;
}

function project(rows, select, agg) {
  // If aggregation active, ensure aggregated column present
  const _select = [...select];
  if (agg && agg.fn && agg.col) {
    const aggName = `${agg.fn}(${agg.col})`;
    if (!_select.includes(aggName)) _select.push(aggName);
  }
  return rows.map(r => {
    const o = {};
    _select.forEach(c => o[c] = r[c]);
    return o;
  });
}

function order(rows, orderBy) {
  if (!orderBy || !orderBy.col) return rows;
  const dir = orderBy.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[orderBy.col], y = b[orderBy.col];
    if (x === y) return 0;
    return (x > y ? 1 : -1) * dir;
  });
}

function round(v) {
  return typeof v === "number" ? Math.round(v * 100) / 100 : v;
}

// --- Rendering ---
function renderFilters() {
  const ul = $("#filters");
  ul.innerHTML = "";
  state.filters.forEach((f, i) => {
    const li = document.createElement("li");
    li.className = "chip";
    li.textContent = `${f.col} ${symbol(f.op)} ${f.val}`;
    const x = document.createElement("span");
    x.className = "x"; x.textContent = "×";
    x.onclick = () => removeFilter(i);
    li.appendChild(x);
    ul.appendChild(li);
  });
}
function symbol(op) {
  return ({gt: ">", lt: "<", eq: "=", neq: "!=", contains: "contains"})[op] || op;
}

function renderGroupBys() {
  const ul = $("#groupBys");
  ul.innerHTML = "";
  state.groupBy.forEach((g, i) => {
    const li = document.createElement("li");
    li.className = "chip";
    li.textContent = g;
    const x = document.createElement("span");
    x.className = "x"; x.textContent = "×";
    x.onclick = () => removeGroup(i);
    li.appendChild(x);
    ul.appendChild(li);
  });
}

function renderTable(rows) {
  const tbl = $("#resultTable");
  tbl.innerHTML = "";
  if (!rows.length) {
    tbl.innerHTML = "<tr><td>No results</td></tr>";
    return;
  }
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  Object.keys(rows[0]).forEach(c => {
    const th = document.createElement("th");
    th.textContent = c;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  const tbody = document.createElement("tbody");
  rows.slice(0, 50).forEach(r => {
    const tr = document.createElement("tr");
    Object.values(r).forEach(v => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(thead);
  tbl.appendChild(tbody);
}

function renderSQL({select, filters, groupBy, orderBy, agg}) {
  const cols = [...select];
  if (agg && agg.fn && agg.col && !cols.includes(`${agg.fn}(${agg.col})`)) {
    cols.push(`${agg.fn}(${agg.col})`);
  }
  const lines = [];
  lines.push(`SELECT ${cols.join(", ")}`);
  lines.push(`FROM data`);
  if (filters.length) {
    const w = filters.map(f => {
      const val = typeof f.val === "number" ? f.val : `'${String(f.val).replace(/'/g, "''")}'`;
      const op = {gt: ">", lt: "<", eq: "=", neq: "!=", contains: "LIKE"}[f.op] || f.op;
      return f.op === "contains" ? `${f.col} ${op} '%${f.val}%'` : `${f.col} ${op} ${val}`;
    }).join(" AND ");
    lines.push(`WHERE ${w}`);
  }
  if (groupBy.length) lines.push(`GROUP BY ${groupBy.join(", ")}`);
  if (orderBy && orderBy.col) lines.push(`ORDER BY ${orderBy.col} ${orderBy.dir.toUpperCase()}`);
  $("#sqlBox").textContent = lines.join("\n");
}

function renderExplain(stats) {
  const lines = [];
  lines.push(`Starting rows: ${stats.start}`);
  if (stats.filtered !== undefined) lines.push(`After filters: ${stats.filtered}`);
  if (stats.groups !== undefined) lines.push(`Groups formed: ${stats.groups}`);
  if (stats.agg) lines.push(`Aggregated: ${stats.agg}`);
  if (stats.sorted) lines.push(`Sorted by: ${stats.sorted}`);
  $("#explainBox").textContent = lines.join("\n");
}

function update() {
  const start = rawRows.length;
  let rows = rawRows;
  rows = applyFilters(rows, state.filters);
  const afterFilter = rows.length;
  let groupedRows = rows;

  if (state.groupBy.length) {
    groupedRows = groupAndAggregate(rows, state.groupBy, state.agg);
  } else if (state.agg && state.agg.fn && state.agg.col) {
    // global aggregate without groupBy
    groupedRows = groupAndAggregate(rows, [], state.agg);
  }

  let projected = project(groupedRows, state.select, state.agg);
  const ob = state.orderBy && state.orderBy.col ? state.orderBy : null;
  const ordered = order(projected, ob);

  $("#stats").textContent = `Rows: ${start} → ${afterFilter} → ${ordered.length}`;
  renderTable(ordered);
  renderFilters();
  renderGroupBys();
  renderSQL({...state, orderBy: ob});
  renderExplain({
    start,
    filtered: afterFilter,
    groups: state.groupBy.length ? new Set(ordered.map(r => state.groupBy.map(g => r[g]).join("|"))).size : undefined,
    agg: state.agg && state.agg.fn ? `${state.agg.fn} on ${state.agg.col}` : undefined,
    sorted: ob ? `${ob.col} ${ob.dir.toUpperCase()}` : undefined
  });
}

// --- Wire up UI ---
$("#fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const { header, data } = parseCSV(String(reader.result));
    columns = header;
    rawRows = data;
    // Defaults
    state.select = [columns];
    const firstNumberCol = columns.find(c => typeof data[c] === "number");
    state.agg = { fn: firstNumberCol ? "SUM" : "", col: firstNumberCol || "" };
    state.filters = [];
    state.groupBy = [];
    state.orderBy = firstNumberCol ? { col: `SUM(${firstNumberCol})`, dir: "desc" } : { col: columns, dir: "asc" };

    renderColumns();
    update();
  };
  reader.readAsText(file);
});

$("#aggSelect").addEventListener("change", e => {
  state.agg.fn = e.target.value || "";
  update();
});
$("#aggColumn").addEventListener("change", e => {
  state.agg.col = e.target.value;
  // If ordering by aggregate, keep name in sync
  if (state.orderBy && state.orderBy.col && /^(SUM|AVG|MIN|MAX|COUNT)\(/.test(state.orderBy.col)) {
    state.orderBy.col = `${state.agg.fn}(${state.agg.col})`;
  }
  update();
});

$("#addFilter").addEventListener("click", () => {
  const col = $("#filterCol").value;
  const op = $("#filterOp").value;
  const val = $("#filterVal").value;
  if (!col || !op) return;
  addFilter(col, op, val);
  $("#filterVal").value = "";
});

$("#addGroupBy").addEventListener("click", () => {
  const col = $("#groupByCol").value;
  if (col) addGroup(col);
});

$("#applyOrder").addEventListener("click", () => {
  const col = $("#orderByCol").value;
  const dir = $("#orderDir").value;
  if (state.agg.fn && state.agg.col === col) {
    state.orderBy = { col: `${state.agg.fn}(${state.agg.col})`, dir };
  } else {
    state.orderBy = { col, dir };
  }
  update();
});

// Initialize empty UI
renderColumns();
renderFilters();
renderGroupBys();
renderTable([]);
$("#sqlBox").textContent = "Upload a CSV to begin.";
$("#explainBox").textContent = "Steps will appear here.";
