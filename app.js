(() => {
  "use strict";
  const D = window.BLOODNET_DATA.data,
    C = window.BLOODNET_DATA.compat;
  const $ = (id) => document.getElementById(id);
  const productNames = {
      red_cells: "گلبول قرمز",
      platelets: "پلاکت",
      plasma: "پلاسما",
    },
    urgencyNames = { critical: "بحرانی", urgent: "فوری", planned: "عادی" },
    statusNames = {
      complete: "تأمین کامل",
      partial: "تأمین ناقص",
      pending: "در حال پیگیری",
      cancelled: "لغوشده",
    };
  const safeParse = (v) => {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };
  let state = safeParse(localStorage.getItem("bloodnet_static_state")) || null;
  function initial() {
    return {
      inventory: D.inventory.map((x, i) => ({
        ...x,
        id: "STK-" + String(i + 1).padStart(4, "0"),
        units: +x.units,
      })),
      requests: [],
      events: [],
      nextId: 1,
      donorInvites: {},
    };
  }
  if (!state) state = initial();
  function save() {
    localStorage.setItem("bloodnet_static_state", JSON.stringify(state));
    $("navRequestCount").textContent = state.requests.length;
  }
  const fmt = (n) => Number(n || 0).toLocaleString("fa-IR");
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const hospital = (id) =>
    D.hospitals.find((x) => x.hospital_id === id)?.name || id;
  const center = (id) => D.centers.find((x) => x.center_id === id)?.name || id;
  const log = (title, desc) => {
    state.events.unshift({
      id: Date.now() + Math.random(),
      title,
      desc,
      time: new Date().toLocaleString("fa-IR"),
    });
    state.events = state.events.slice(0, 250);
    save();
  };
  function toast(msg, error = false) {
    let el = document.createElement("div");
    el.className = "toast" + (error ? " error" : "");
    el.textContent = msg;
    $("toasts").append(el);
    setTimeout(() => el.remove(), 3300);
  }
  let currentUser = null;
  const roleMeta = {
    admin: {
      label: "مدیریت سیستم",
      pages: [
        "dashboard",
        "requests",
        "inventory",
        "hospitals",
        "donors",
        "activity",
      ],
    },
    center: {
      label: "مرکز تأمین و انتقال خون",
      pages: ["dashboard", "requests", "inventory", "activity"],
    },
    hospital: {
      label: "بیمارستان",
      pages: ["dashboard", "requests", "hospitals"],
    },
  };
  const roleCodes = {
    admin: "ADMIN-2026",
    center: "CENTER-2026",
    hospital: "HOSP-2026",
  };
  function fillLoginOrg() {
    let role = $("loginRole").value,
      sel = $("loginOrg");
    $("orgLabel").classList.toggle("hidden", role === "admin");
    sel.innerHTML = (
      role === "hospital"
        ? D.hospitals.map((x) => ({ id: x.hospital_id, name: x.name }))
        : D.centers.map((x) => ({ id: x.center_id, name: x.name }))
    )
      .map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`)
      .join("");
  }
  function applyRole() {
    let pages = roleMeta[currentUser.role].pages;
    document
      .querySelectorAll(".nav-item[data-page]")
      .forEach((b) =>
        b.classList.toggle("hidden", !pages.includes(b.dataset.page)),
      );
    document
      .querySelectorAll("[data-goto]")
      .forEach((b) =>
        b.classList.toggle("hidden", !pages.includes(b.dataset.goto)),
      );
    document
      .querySelectorAll('[data-action="new-request"]')
      .forEach((b) =>
        b.classList.toggle("hidden", currentUser.role === "center"),
      );
    $("resetBtn").classList.toggle("hidden", currentUser.role !== "admin");
    $("exportBtn").classList.toggle("hidden", currentUser.role !== "admin");
    $("userRoleLabel").textContent = roleMeta[currentUser.role].label;
    $("sidebar").classList.remove("open");
    $("loginGate").classList.add("hidden");
    document.querySelector(".app-shell").classList.add("authenticated");
    go(currentUser.role === "hospital" ? "requests" : "dashboard");
  }
  function login() {
    let role = $("loginRole").value,
      code = $("accessCode").value.trim().toUpperCase();
    if (code !== roleCodes[role]) {
      $("loginError").classList.remove("hidden");
      return;
    }
    currentUser = {
      role,
      orgId: role === "admin" ? null : $("loginOrg").value,
    };
    sessionStorage.setItem("bloodnet_demo_user", JSON.stringify(currentUser));
    $("loginError").classList.add("hidden");
    applyRole();
  }
  function logout() {
    sessionStorage.removeItem("bloodnet_demo_user");
    currentUser = null;
    document.querySelector(".app-shell").classList.remove("authenticated");
    $("loginGate").classList.remove("hidden");
    $("accessCode").value = "";
  }
  $("loginRole").addEventListener("change", fillLoginOrg);
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    login();
  });
  $("logoutBtn").addEventListener("click", logout);
  fillLoginOrg();
  try {
    let u = JSON.parse(sessionStorage.getItem("bloodnet_demo_user") || "null");
    if (u && roleMeta[u.role] && (u.role === "admin" || u.orgId)) {
      currentUser = u;
      applyRole();
    }
  } catch {}
  function status(r) {
    if (r.cancelled) return "cancelled";
    if (r.supplied >= r.units) return "complete";
    if (r.supplied > 0) return "partial";
    return "pending";
  }
  function statusBadge(s) {
    return `<span class="status ${s}">${statusNames[s]}</span>`;
  }
  function urgencyBadge(u) {
    return `<span class="urgency ${u}">${urgencyNames[u]}</span>`;
  }
  function go(page) {
    if (currentUser && !roleMeta[currentUser.role].pages.includes(page)) {
      toast("شما به این بخش دسترسی ندارید.", true);
      return;
    }
    document
      .querySelectorAll(".page")
      .forEach((x) => x.classList.remove("active"));
    $("page-" + page).classList.add("active");
    document
      .querySelectorAll(".nav-item[data-page]")
      .forEach((x) => x.classList.toggle("active", x.dataset.page === page));
    let title = {
      dashboard: "نمای کلی سامانه",
      requests: "مدیریت درخواست‌ها",
      inventory: "موجودی مراکز",
      hospitals: "بیمارستان‌ها",
      donors: "اهداکنندگان",
      activity: "گزارش رویدادها",
    }[page];
    $("pageTitle").textContent = title;
    $("pageCrumb").textContent = title;
    $("sidebar").classList.remove("open");
    renderPage(page);
  }
  function renderDashboard() {
    let visibleRequests = state.requests.filter(
      (r) =>
        currentUser?.role !== "hospital" || r.hospitalId === currentUser.orgId,
    );
    let total = visibleRequests.length,
      complete = visibleRequests.filter((r) => status(r) === "complete").length,
      open = visibleRequests.filter((r) =>
        ["pending", "partial"].includes(status(r)),
      ).length,
      units = state.inventory.reduce((a, x) => a + x.units, 0);
    $("stats").innerHTML = [
      ["کل درخواست‌ها", fmt(total), "درخواست ثبت‌شده", "▤"],
      ["درخواست‌های باز", fmt(open), "نیازمند پیگیری", "◷"],
      ["واحد موجودی", fmt(units), "در تمام مراکز", "▥"],
      ["تأمین کامل", fmt(complete), "درخواست تعیین‌تکلیف‌شده", "✓"],
    ]
      .map(
        (x) =>
          `<div class="stat-card"><div class="stat-top"><span>${x[0]}</span><span class="stat-icon">${x[3]}</span></div><div class="stat-value">${x[1]}</div><div class="stat-sub">${x[2]}</div></div>`,
      )
      .join("");
    $("recentRows").innerHTML =
      visibleRequests
        .slice(0, 6)
        .map(
          (r) =>
            `<tr><td class="id">${r.id}</td><td>${esc(hospital(r.hospitalId))}</td><td>${productNames[r.product]}</td><td>${r.blood}</td><td><span class="progress"><i style="width:${Math.min(100, (r.supplied / r.units) * 100)}%"></i></span>${fmt(r.supplied)} / ${fmt(r.units)}</td><td>${statusBadge(status(r))}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="6" class="empty">هنوز درخواستی ثبت نشده است.</td></tr>';
    let totals = Object.keys(productNames).map((p) => [
        productNames[p],
        state.inventory
          .filter((x) => x.product === p)
          .reduce((a, x) => a + x.units, 0),
      ]),
      max = Math.max(1, ...totals.map((x) => x[1]));
    $("stockSummary").innerHTML = totals
      .map(
        ([n, v]) =>
          `<div class="stock-line"><span>${n}</span><div class="stock-track"><i style="width:${(v / max) * 100}%"></i></div><b>${fmt(v)}</b></div>`,
      )
      .join("");
    let ss = ["complete", "partial", "pending", "cancelled"];
    $("statusSummary").innerHTML = ss
      .map(
        (s) =>
          `<div class="status-line"><span>${statusNames[s]}</span><b>${fmt(visibleRequests.filter((r) => status(r) === s).length)}</b></div>`,
      )
      .join("");
    $("centerCards").innerHTML = D.centers
      .map(
        (c) =>
          `<div class="center-card"><b>${esc(c.name)}</b><small>شناسه ${c.center_id}</small><div class="center-meta"><span>موجودی ثبت‌شده</span><b>${fmt(state.inventory.filter((x) => x.center_id === c.center_id).reduce((a, x) => a + x.units, 0))} واحد</b></div></div>`,
      )
      .join("");
  }
  function renderRequests() {
    let q = $("requestSearch").value.trim().toLowerCase(),
      sf = $("statusFilter").value,
      uf = $("urgencyFilter").value;
    let rows = state.requests.filter(
      (r) =>
        (currentUser?.role !== "hospital" ||
          r.hospitalId === currentUser.orgId) &&
        (!q ||
          r.id.toLowerCase().includes(q) ||
          hospital(r.hospitalId).toLowerCase().includes(q)) &&
        (sf === "all" || status(r) === sf) &&
        (uf === "all" || r.urgency === uf),
    );
    $("requestRows").innerHTML = rows
      .map(
        (r) =>
          `<tr><td class="id">${r.id}</td><td>${esc(hospital(r.hospitalId))}</td><td>${productNames[r.product]}</td><td>${r.blood}</td><td>${fmt(r.units)}</td><td>${fmt(r.supplied)}</td><td>${urgencyBadge(r.urgency)}</td><td>${statusBadge(status(r))}</td><td><button class="text-btn" data-detail="${r.id}">جزئیات</button></td></tr>`,
      )
      .join("");
    $("emptyRequests").classList.toggle("hidden", rows.length > 0);
  }
  function renderInventory() {
    let q = $("inventorySearch").value.trim().toLowerCase(),
      p = $("productFilter").value,
      b = $("bloodFilter").value,
      rows = state.inventory.filter(
        (x) =>
          (currentUser?.role !== "center" ||
            x.center_id === currentUser.orgId) &&
          (!q || center(x.center_id).toLowerCase().includes(q)) &&
          (p === "all" || x.product === p) &&
          (b === "all" || x.blood_group === b),
      );
    $("inventoryRows").innerHTML =
      rows
        .map(
          (x) =>
            `<tr><td>${esc(center(x.center_id))}</td><td>${productNames[x.product]}</td><td>${x.blood_group}</td><td><b>${fmt(x.units)}</b></td><td>${esc(x.expires_at)}</td><td>${x.units > 0 ? '<span class="status complete">قابل بررسی</span>' : '<span class="status cancelled">اتمام موجودی</span>'}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="6" class="empty">موردی یافت نشد.</td></tr>';
    let total = state.inventory.reduce((a, x) => a + x.units, 0),
      products = Object.keys(productNames).map((p) =>
        state.inventory
          .filter((x) => x.product === p)
          .reduce((a, x) => a + x.units, 0),
      );
    $("inventoryStats").innerHTML = [
      ["کل واحدها", fmt(total)],
      ["گلبول قرمز", fmt(products[0])],
      ["پلاکت", fmt(products[1])],
      ["پلاسما", fmt(products[2])],
    ]
      .map(
        (x) =>
          `<div class="stat-card"><div class="stat-top">${x[0]}</div><div class="stat-value">${x[1]}</div></div>`,
      )
      .join("");
  }
  function renderHospitals() {
    $("hospitalCards").innerHTML = D.hospitals
      .filter(
        (h) =>
          currentUser?.role !== "hospital" ||
          h.hospital_id === currentUser.orgId,
      )
      .map(
        (h) =>
          `<div class="hospital-card"><div class="hospital-symbol">⌂</div><b>${esc(h.name)}</b><small>شناسه ${h.hospital_id}</small><div class="center-meta"><span>سطح دسته‌بندی داده</span><b>${esc(h.credit_level)}</b></div></div>`,
      )
      .join("");
  }
  function renderDonors() {
    let q = $("donorSearch").value.trim().toUpperCase(),
      b = $("donorBloodFilter").value,
      rows = D.donors
        .filter(
          (d) =>
            (!q || d.donor_id.includes(q)) &&
            (b === "all" || d.blood_group === b),
        )
        .slice(0, 100);
    let deferred = new Set(D.donorEvents.map((e) => e.donor_id));
    $("donorRows").innerHTML = rows
      .map(
        (d) =>
          `<tr><td class="id">${d.donor_id}</td><td>${d.blood_group}</td><td>${fmt(d.age)}</td><td>${deferred.has(d.donor_id) ? '<span class="status partial">دارای رویداد تعلیق</span>' : '<span class="status complete">بدون رویداد ثبت‌شده</span>'}</td><td>${fmt(d.notified_90d)}</td></tr>`,
      )
      .join("");
    $("donorFoot").textContent =
      `نمایش ${fmt(rows.length)} نفر از ${fmt(D.donors.length)} پروفایل ساختگی`;
    let groups = ["O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-"];
    $("donorStats").innerHTML = [
      ["کل پروفایل‌ها", fmt(D.donors.length)],
      ["گروه O+", fmt(D.donors.filter((d) => d.blood_group === "O+").length)],
      ["رویدادهای تعلیق", fmt(D.donorEvents.length)],
      ["تعلیق‌های ثبت‌شده", "داده ساختگی"],
    ]
      .map(
        (x) =>
          `<div class="stat-card"><div class="stat-top">${x[0]}</div><div class="stat-value">${x[1]}</div></div>`,
      )
      .join("");
  }
  function renderActivity() {
    $("activityList").innerHTML =
      state.events
        .map(
          (e) =>
            `<div class="activity-item"><div class="activity-icon">◷</div><div><b>${esc(e.title)}</b><small>${esc(e.desc)} • ${esc(e.time)}</small></div></div>`,
        )
        .join("") || '<div class="empty">هنوز رویدادی ثبت نشده است.</div>';
  }
  function renderPage(p) {
    (
      ({
        dashboard: renderDashboard,
        requests: renderRequests,
        inventory: renderInventory,
        hospitals: renderHospitals,
        donors: renderDonors,
        activity: renderActivity,
      })[p] || (() => {})
    )();
  }
  function showNew() {
    if (currentUser?.role === "center") {
      toast("مرکز خون امکان ثبت درخواست بیمارستانی ندارد.", true);
      return;
    }
    $("hospitalSelect").innerHTML = D.hospitals
      .filter(
        (h) =>
          currentUser?.role !== "hospital" ||
          h.hospital_id === currentUser.orgId,
      )
      .map((h) => `<option value="${h.hospital_id}">${esc(h.name)}</option>`)
      .join("");
    if (currentUser?.role === "hospital") $("hospitalSelect").disabled = true;
    $("modal").classList.remove("hidden");
  }
  function hideNew() {
    $("modal").classList.add("hidden");
    $("hospitalSelect").disabled = false;
  }
  function allocate(r) {
    let compatible = C[r.product]?.[r.blood] || [],
      items = state.inventory
        .filter(
          (x) =>
            x.product === r.product &&
            compatible.includes(x.blood_group) &&
            x.units > 0 &&
            new Date(x.expires_at) > new Date(),
        )
        .sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));
    let need = r.units;
    for (let x of items) {
      if (!need) break;
      let n = Math.min(need, x.units);
      x.units -= n;
      need -= n;
      r.allocations.push({
        centerId: x.center_id,
        blood: x.blood_group,
        units: n,
        stockId: x.id,
        expiry: x.expires_at,
      });
    }
    r.supplied = r.units - need;
    r.shortage = need;
    // Browser-only donor invitation simulation: eligible synthetic profiles are counted as invited, not as donated supply.
    if (need > 0) {
      let eligible = D.donors
        .filter(
          (d) =>
            compatible.includes(d.blood_group) &&
            d.permanently_excluded !== "1" &&
            +d.age >= 18 &&
            +d.age <= 65 &&
            +d.weight_kg >= 50 &&
            +d.notified_90d < 3 &&
            !state.donorInvites[d.donor_id] &&
            !D.donorEvents.some((e) => e.donor_id === d.donor_id),
        )
        .slice(0, Math.min(need * 5, 30));
      r.invited = eligible.map((d) => d.donor_id);
      eligible.forEach((d) => (state.donorInvites[d.donor_id] = r.id));
    } else r.invited = [];
    r.simulatedDonations = 0;
    r.workflowNote = need
      ? `برای کسری ${need} واحد، ${r.invited.length} دعوت نمایشی ایجاد شد.`
      : "موجودی سازگار برای پوشش درخواست کافی بود.";
  }
  function createRequest(ev) {
    ev.preventDefault();
    if (currentUser?.role === "center") {
      toast("دسترسی ثبت درخواست برای این نقش فعال نیست.", true);
      return;
    }
    let units = +$("unitsInput").value;
    if (!Number.isInteger(units) || units < 1 || units > 500) {
      toast("تعداد واحد باید بین ۱ تا ۵۰۰ باشد.", true);
      return;
    }
    let r = {
      id: "BN-" + String(state.nextId++).padStart(5, "0"),
      hospitalId: $("hospitalSelect").value,
      product: $("productSelect").value,
      blood: $("bloodSelect").value,
      units,
      urgency: $("urgencySelect").value,
      note: $("noteInput").value.trim(),
      createdAt: new Date().toISOString(),
      supplied: 0,
      shortage: units,
      allocations: [],
      invited: [],
      simulatedDonations: 0,
      cancelled: false,
    };
    allocate(r);
    state.requests.unshift(r);
    log(
      "درخواست جدید ثبت شد",
      `${r.id} • ${hospital(r.hospitalId)} • ${r.workflowNote}`,
    );
    save();
    hideNew();
    $("requestForm").reset();
    toast(`درخواست ${r.id} ثبت شد.`);
    go("requests");
  }
  function detail(id) {
    let r = state.requests.find((x) => x.id === id);
    if (!r) return;
    $("detailTitle").textContent = r.id;
    let s = status(r);
    $("detailBody").innerHTML =
      `<div class="detail-kpis"><div class="detail-kpi"><small>تعداد درخواستی</small><b>${fmt(r.units)}</b></div><div class="detail-kpi"><small>تأمین‌شده</small><b>${fmt(r.supplied)}</b></div><div class="detail-kpi"><small>باقی‌مانده</small><b>${fmt(Math.max(0, r.units - r.supplied))}</b></div></div><div class="detail-section"><h4>مشخصات درخواست</h4><p>بیمارستان: ${esc(hospital(r.hospitalId))}<br>فرآورده: ${productNames[r.product]} • گروه خونی: ${r.blood}<br>فوریت: ${urgencyNames[r.urgency]} • وضعیت: ${statusNames[s]}<br>ثبت: ${new Date(r.createdAt).toLocaleString("fa-IR")}</p></div><div class="detail-section"><h4>تخصیص موجودی (اولویت FEFO)</h4>${r.allocations.length ? r.allocations.map((a) => `<p>${esc(center(a.centerId))} — ${a.blood} — ${fmt(a.units)} واحد — انقضا: ${esc(a.expiry)}</p>`).join("") : "<p>واحدی از موجودی تخصیص داده نشده است.</p>"}</div><div class="detail-section"><h4>دعوت‌های نمایشی اهداکنندگان</h4><p>${r.invited.length ? `تعداد دعوت نمایشی: ${fmt(r.invited.length)}. قبول دعوت به معنی اهدای خون نیست و در مقدار تأمین‌شده محاسبه نشده است.` : "برای این درخواست دعوت نمایشی ثبت نشده است."}</p>${r.invited.length ? `<p>شناسه‌ها: ${r.invited.slice(0, 12).join("، ")}${r.invited.length > 12 ? " …" : ""}</p>` : ""}</div><div class="form-warning">نسخه مرورگری، پاسخ Gateway یا رویداد واقعی اهدای خون دریافت نمی‌کند. دکمه‌های زیر فقط وضعیت دموی محلی را تغییر می‌دهند.</div><div class="detail-actions">${!r.cancelled && s !== "complete" ? `<button class="primary-btn" data-donate="${r.id}">ثبت اهدای نمایشی +۱</button><button class="secondary-btn" data-cancel="${r.id}">لغو درخواست</button>` : ""}<button class="secondary-btn" data-close-detail>بستن</button></div>`;
    $("detailModal").classList.remove("hidden");
  }
  function donate(id) {
    let r = state.requests.find((x) => x.id === id);
    if (!r || r.cancelled || r.supplied >= r.units) return;
    let amount = Math.min(1, r.units - r.supplied);
    r.supplied += amount;
    r.simulatedDonations++;
    r.shortage = r.units - r.supplied;
    log(
      "رویداد اهدای نمایشی ثبت شد",
      `${r.id} • یک واحد به تأمین نمایشی افزوده شد.`,
    );
    save();
    detail(id);
    renderDashboard();
    toast("یک واحد به تأمین نمایشی اضافه شد.");
  }
  function cancel(id) {
    let r = state.requests.find((x) => x.id === id);
    if (!r || r.cancelled) return;
    r.cancelled = true; // restore stock reserved by this request in the local demo
    r.allocations.forEach((a) => {
      let x = state.inventory.find((z) => z.id === a.stockId);
      if (x) x.units += a.units;
    });
    r.allocations = [];
    log("درخواست لغو شد", `${r.id} • موجودی تخصیص‌یافته به انبار دمو بازگشت.`);
    save();
    $("detailModal").classList.add("hidden");
    renderDashboard();
    renderRequests();
    toast("درخواست لغو و موجودی دمو آزاد شد.");
  }
  // Navigation and controls
  document
    .querySelectorAll("[data-page]")
    .forEach((b) => b.addEventListener("click", () => go(b.dataset.page)));
  document
    .querySelectorAll("[data-goto]")
    .forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));
  document
    .querySelectorAll('[data-action="new-request"]')
    .forEach((b) => b.addEventListener("click", showNew));
  $("closeModal").onclick = $("cancelModal").onclick = hideNew;
  $("requestForm").addEventListener("submit", createRequest);
  $("closeDetail").onclick = () => $("detailModal").classList.add("hidden");
  $("detailModal").addEventListener("click", (e) => {
    if (e.target === $("detailModal")) $("detailModal").classList.add("hidden");
  });
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) hideNew();
  });
  $("requestSearch").addEventListener("input", renderRequests);
  ["statusFilter", "urgencyFilter"].forEach((id) =>
    $(id).addEventListener("change", renderRequests),
  );
  ["inventorySearch", "productFilter", "bloodFilter"].forEach((id) =>
    $(id).addEventListener(
      id.includes("Search") ? "input" : "change",
      renderInventory,
    ),
  );
  ["donorSearch", "donorBloodFilter"].forEach((id) =>
    $(id).addEventListener(
      id.includes("Search") ? "input" : "change",
      renderDonors,
    ),
  );
  $("requestRows").addEventListener("click", (e) => {
    let b = e.target.closest("[data-detail]");
    if (b) detail(b.dataset.detail);
  });
  $("detailBody").addEventListener("click", (e) => {
    let d = e.target.closest("[data-donate]"),
      c = e.target.closest("[data-cancel]");
    if (d) donate(d.dataset.donate);
    if (c) cancel(c.dataset.cancel);
    if (e.target.closest("[data-close-detail]"))
      $("detailModal").classList.add("hidden");
  });
  $("themeBtn").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem(
      "bloodnet_theme",
      document.body.classList.contains("dark") ? "dark" : "light",
    );
  };
  if (localStorage.getItem("bloodnet_theme") === "dark")
    document.body.classList.add("dark");
  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");
  document.addEventListener("click", (e) => {
    if (
      window.innerWidth < 760 &&
      !e.target.closest("#sidebar") &&
      !e.target.closest("#menuBtn")
    )
      $("sidebar").classList.remove("open");
  });
  $("resetBtn").onclick = () => {
    if (currentUser?.role !== "admin") return;
    if (
      confirm("تمام درخواست‌ها و تغییرات محلی حذف و داده دمو بازنشانی شود؟")
    ) {
      state = initial();
      save();
      log("داده‌های دمو بازنشانی شد", "موجودی به تصویر آغازین کیت بازگشت.");
      go("dashboard");
      toast("داده‌های دمو بازنشانی شد.");
    }
  };
  $("exportBtn").onclick = () => {
    let blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "bloodnet-demo-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  $("navRequestCount").textContent = state.requests.length;
  renderDashboard();
})();
