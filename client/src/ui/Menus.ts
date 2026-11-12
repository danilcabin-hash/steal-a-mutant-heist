import {
  BIOMES,
  EGG_BY_ID,
  FEATURED,
  FUSE,
  HATCH,
  INDEX_COMPLETE_REWARD,
  INDEX_REWARD,
  MUTATION_BY_ID,
  PETS,
  PET_BY_ID,
  RARITY_COLOR, RARITY_LABEL,
  SELL_MULT,
  SHOP_ITEMS,
  TRAILS,
  formatShort,
  hatchOdds,
  petDisplayName,
  petIncome,
  eggSellValue,
  fusedEggId,
  fusionFee,
  rollFusionWeight,
  type InvEgg,
  type InvPet,
  type InventoryMsg,
} from "@egg/shared";
import { Modal, esc } from "./Modal.ts";

/** Everything the menus need to draw, refreshed whenever the inventory or money changes. */
export interface MenuData {
  inv: InventoryMsg | null;
  money: number;
  trail: string;
}

export interface MenuActions {
  shopBuy(item: string, count?: number): void;
  claim(which: string): void;
  sell(uids: string[]): void;
  fuse(uids: string[]): void;
  buyTrail(id: string): void;
  equipTrail(id: string): void;
}

const petCard = (p: InvPet, extra = "", selected = false) => {
  const def = PET_BY_ID.get(p.species)!;
  const mut = p.mutation ? MUTATION_BY_ID.get(p.mutation) : undefined;
  return `<button class="pet-card${selected ? " sel" : ""}${p.equipped ? " on" : ""}" data-uid="${p.uid}" style="--rc:${RARITY_COLOR[def.rarity]}">
    <span class="pc-kg">${p.weight} кг</span>
    <span class="pc-icon">${def.icon}</span>
    <span class="pc-name" style="color:${mut ? mut.color : "#fff"}">${esc(petDisplayName(def, p.mutation))}</span>
    <span class="pc-inc">$${formatShort(p.income)}/с</span>${extra}
  </button>`;
};

const price = (v: number) => `<span class="pc-price">$${formatShort(v)}</span>`;

/** An unhatched egg, styled like a pet card (size where the pet shows  кг, rarity where it shows $/s). */
const eggCard = (e: InvEgg, extra = "", selected = false) => {
  const def = EGG_BY_ID.get(e.defId)!;
  return `<button class="pet-card${selected ? " sel" : ""}" data-uid="${e.uid}" style="--rc:${RARITY_COLOR[def.rarity]}">
    <span class="pc-kg">размер ${e.size.toFixed(2)}</span>
    <span class="pc-icon">🥚</span>
    <span class="pc-name">${esc(def.name)}</span>
    <span class="pc-inc">Редкость: ${RARITY_LABEL[def.rarity]}</span>${extra}
  </button>`;
};

/** Biomes with pets to discover, in corridor order (drives the Pet Index's World tab paging). */
const WORLD_BIOMES = BIOMES.filter((b) => PETS.some((p) => p.biome === b.id));

const countdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d} д ${h} ч ${m} мин ${String(s % 60).padStart(2, "0")} с`;
};

/**
 * All Phase 5 menus: Shop (Gems), Pet Index, Sell Pets, Fuse Machine and Trails Shop.
 */
export class Menus {
  readonly shop: Modal;
  readonly index: Modal;
  readonly sellM: Modal;
  readonly fuseM: Modal;
  readonly trails: Modal;
  private data: MenuData = { inv: null, money: 0, trail: "" };
  private sellSel = new Set<string>();
  private sellSort: "weight" | "value" = "value";
  private fuseSel: string[] = [];
  private indexPet = "";
  private indexBiome = "";

  constructor(root: HTMLElement, private actions: MenuActions) {
    this.shop = new Modal(root, "Магазин", "#4ce11f", [
      { id: "featured", label: "Акции", icon: "🏷️", color: "#ff5a3a" },
      { id: "speed", label: "Скорость", icon: "👟", color: "#2f9bff" },
      { id: "money", label: "Деньги", icon: "💵", color: "#4ce11f" },
      { id: "gear", label: "Снаряжение", icon: "🗡️", color: "#9fb4c8" },
    ]);
    this.index = new Modal(root, "Коллекция", "#1fc0ff", [
      { id: "world", label: "Биомы", icon: "🌍", color: "#1f8bff" },
      { id: "limited", label: "Особые", icon: "⏳", color: "#b8860b" },
    ]);
    this.sellM = new Modal(root, "💰 Продажа мутантов и капсул", "#4ce11f");
    this.fuseM = new Modal(root, "Аппарат слияния", "#8a4dff");
    this.trails = new Modal(root, "Магазин следов", "#c04dff");
    for (const m of [this.shop, this.index, this.sellM, this.fuseM, this.trails]) {
      m.onTab = () => this.render(m);
      m.body.addEventListener("pointerdown", () => (this.scrollDragging = true));
    }
    addEventListener("pointerup", () => (this.scrollDragging = false));
    addEventListener("pointercancel", () => (this.scrollDragging = false));
    this.sellM.onClose = () => this.sellSel.clear();
    this.fuseM.onClose = () => (this.fuseSel = []);
    this.wire();
  }

  /** Redraws open menus only when their data changed (redrawing under the mouse would swallow clicks). */
  update(data: MenuData) {
    // Money ticks every second; only the Trails Shop shows it, so leave it out of the change check elsewhere.
    // The Fuse Machine only cares whether you can afford the fee of the pets you picked.
    const fuseSpecies = this.fuseM.isOpen ? this.data.inv?.pets.find((p) => p.uid === this.fuseSel[0])?.species : undefined;
    const sig = JSON.stringify({ ...data, money: this.trails.isOpen ? data.money : 0, canCash: SHOP_ITEMS.map((i) => !!i.cash && data.money >= i.cash), canFuse: fuseSpecies ? data.money >= fusionFee(fuseSpecies) : null });
    const changed = sig !== this.sig;
    this.sig = sig;
    this.data = data;
    if (changed) for (const m of [this.shop, this.index, this.sellM, this.fuseM, this.trails]) if (m.isOpen) this.render(m);
    // The Featured countdown ticks in place.
    const t = this.shop.isOpen ? this.shop.body.querySelector(".ft-time") : null;
    if (t) t.textContent = FEATURED.endsAt > Date.now() ? countdown(FEATURED.endsAt - Date.now()) : "Завершено";
  }

  private sig = "";

  open(which: "shop" | "index" | "sell" | "fuse" | "trails") {
    const m = { shop: this.shop, index: this.index, sell: this.sellM, fuse: this.fuseM, trails: this.trails }[which];
    m.open();
    this.render(m);
  }

  /** Unclaimed Index rewards (red badge on the Index button). */
  get unclaimed() {
    const inv = this.data.inv;
    return inv ? inv.discovered.filter((s) => !inv.claimed.includes(s)).length : 0;
  }

  // ------------------------------------------------------------------ rendering

  private render(m: Modal) {
    // Re-rendering replaces the HTML (Например, every second while money ticks), which would snap every scroll bar back to
    // the start: remember where each scrollable part was and put it back. A drag in progress is left alone.
    if (this.scrollDragging) return;
    const scrolled = [m.body, ...m.body.querySelectorAll<HTMLElement>("*")]
      .map((el, i) => ({ i, left: el.scrollLeft, top: el.scrollTop }))
      .filter((s) => s.left || s.top);
    if (m === this.shop) this.renderShop();
    else if (m === this.index) this.renderIndex();
    else if (m === this.sellM) this.renderSell();
    else if (m === this.fuseM) this.renderFuse();
    else if (m === this.trails) this.renderTrails();
    const els = [m.body, ...m.body.querySelectorAll<HTMLElement>("*")];
    for (const s of scrolled) {
      const el = els[s.i];
      if (!el) continue;
      el.scrollLeft = s.left;
      el.scrollTop = s.top;
    }
  }

  /** True while the mouse button is held down (dragging a scroll bar): re-renders wait until it's released. */
  private scrollDragging = false;

  private gemsBadge() {
    return `<span class="gems-pill">💎 ${formatShort(this.data.inv?.gems ?? 0)}</span>`;
  }

  private renderShop() {
    this.shop.headerExtra.innerHTML = this.gemsBadge();
    const gems = this.data.inv?.gems ?? 0;
    if (this.shop.tab === "featured") {
      const egg = EGG_BY_ID.get(FEATURED.eggId)!;
      const odds = hatchOdds(egg.id)
        .sort((a, b) => b.pct - a.pct)
        .map(({ petId, pct }) => {
          const d = PET_BY_ID.get(petId)!;
          return `<div class="odd-card${pct <= 2 ? " rare" : ""}" style="--rc:${RARITY_COLOR[d.rarity]}" title="${esc(d.name)} (${RARITY_LABEL[d.rarity]})"><span>${d.icon}</span><b>${pct}%</b></div>`;
        })
        .join("");
      const left = FEATURED.endsAt - Date.now();
      this.shop.body.innerHTML = `<div class="shop-title">Акция</div>
        <div class="featured">
          <div class="ft-top"><span class="ft-new">Новинка!</span><span class="ft-name">${esc(egg.name.toUpperCase())}</span><span class="ft-time">${left > 0 ? countdown(left) : "Завершено"}</span></div>
          <div class="ft-sub">Временная акция · созревает за ${HATCH[egg.id].growSec} с · поставь капсулу в загоне</div>
          <div class="ft-odds">${odds}</div>
          <div class="ft-buy">${FEATURED.bundles
            .map(
              (b) => `<button class="gem-btn${gems >= b.gems && left > 0 ? "" : " no"}" data-buy="featured" data-count="${b.count}">
                ${"was" in b && b.was ? `<s>💎${b.was}</s>` : ""}💎 ${b.gems}<small>Капсул: ${b.count}</small></button>`,
            )
            .join("")}</div>
        </div>
        <div class="shop-note">💎 Кристаллы можно получить за заполнение коллекции.</div>`;
      return;
    }
    const items = SHOP_ITEMS.filter((i) => i.tab === this.shop.tab);
    this.shop.body.innerHTML = `<div class="shop-grid">${items
      .map(
        (i) => `<div class="shop-item"><div class="si-icon">${i.icon}</div><div class="si-title">${esc(i.title)}</div>
          <div class="si-desc">${esc(i.desc)}</div>
          ${
            i.cash
              ? `<button class="gem-btn${this.data.money >= i.cash ? "" : " no"}" data-buy="${i.id}">💵 ${formatShort(i.cash)}</button>`
              : `<button class="gem-btn${gems >= i.gems ? "" : " no"}" data-buy="${i.id}">💎 ${i.gems}</button>`
          }</div>`,
      )
      .join("")}</div>${
      this.shop.tab === "speed" && (this.data.inv?.boostLeft ?? 0) > 0
        ? `<div class="shop-note">⚡ Скорость ×2 ещё ${Math.ceil((this.data.inv?.boostLeft ?? 0) / 60)} мин.</div>`
        : ""
    }`;
  }

  private renderIndex() {
    const inv = this.data.inv;
    const found = new Set(inv?.discovered ?? []);
    const claimed = new Set(inv?.claimed ?? []);
    const isLimited = this.index.tab === "limited";
    if (!isLimited && !WORLD_BIOMES.some((b) => b.id === this.indexBiome)) this.indexBiome = WORLD_BIOMES[0]?.id ?? "";
    const biome = isLimited ? "limited" : this.indexBiome;
    const pets = PETS.filter((p) => p.biome === biome);
    if (!this.indexPet || !pets.some((p) => p.id === this.indexPet)) this.indexPet = pets[0].id;
    const done = pets.filter((p) => found.has(p.id)).length;
    const cards = pets
      .map((p) => {
        const have = found.has(p.id);
        const reward = have && !claimed.has(p.id);
        return `<button class="idx-card${have ? "" : " unknown"}${p.id === this.indexPet ? " sel" : ""}" data-pet="${p.id}" style="--rc:${RARITY_COLOR[p.rarity]}">
          <span class="ic-name">${have ? esc(p.name) : "???"}</span><span class="ic-icon">${p.icon}</span>${reward ? `<span class="ic-dot">!</span>` : ""}</button>`;
      })
      .join("");
    const sel = PET_BY_ID.get(this.indexPet)!;
    const have = found.has(sel.id);
    const r = INDEX_REWARD[sel.rarity];
    const money = petIncome(sel, sel.baseWeight, "") * r.incomeMult;
    const canClaim = have && !claimed.has(sel.id);
    const biomeDef = WORLD_BIOMES.find((b) => b.id === biome);
    const pageLabel = isLimited ? "⏳ Особые" : `${biomeDef?.emoji ?? ""} ${biomeDef?.name ?? ""}`;
    const canPage = !isLimited && WORLD_BIOMES.length > 1;
    this.index.headerExtra.innerHTML = "";
    this.index.body.innerHTML = `<div class="idx">
      <div class="idx-left">
        <div class="idx-page">${canPage ? `<button class="idx-nav" data-page="-1">‹</button>` : ""}<span>${pageLabel}</span>${canPage ? `<button class="idx-nav" data-page="1">›</button>` : ""}</div>
        <div class="idx-grid">${cards}</div>
        <div class="idx-bar"><div style="width:${(done / pets.length) * 100}%"></div><span>${done}/${pets.length}</span><em title="За полную страницу: +${INDEX_COMPLETE_REWARD.gems} 💎 и +1 место в загоне">🎁</em></div>
      </div>
      <div class="idx-right">
        <div class="idx-detail" style="--rc:${RARITY_COLOR[sel.rarity]}">
          <div class="idd-icon${have ? "" : " unknown"}">${sel.icon}</div>
          <div class="idd-name">${have ? esc(sel.name) : "???"}</div>
          <div class="idd-rarity" style="color:${RARITY_COLOR[sel.rarity]}">${RARITY_LABEL[sel.rarity]}</div>
          <div class="idd-inc">${have ? `$${formatShort(petIncome(sel, sel.baseWeight, ""))}/с` : "Открой капсулу, чтобы узнать"}</div>
        </div>
        <div class="idx-rewards"><b>Награды</b>
          <div class="idr-row"><span>💵 $${formatShort(money)}</span><span>👟 +${formatShort(r.speed)}</span></div>
          <button class="claim-btn" data-claim="${sel.id}" ${canClaim ? "" : "disabled"}>${claimed.has(sel.id) ? "ПОЛУЧЕНО" : "ЗАБРАТЬ"}</button>
        </div>
      </div>
    </div>
    <button class="claim-all" data-claim="all" ${this.unclaimed ? "" : "disabled"}>📘 ЗАБРАТЬ ВСЁ (${this.unclaimed})!</button>`;
  }

  /** Only items sitting in the inventory can be sold or fused: not pets in the pen, not anything on the hotbar. */
  private inInventory(uid: string, inPen = false) {
    return !inPen && !(this.data.inv?.hotbar ?? []).includes(uid);
  }

  /** Why some owned items aren't listed (null when nothing is held back). */
  private heldBackNote(what: string) {
    const inv = this.data.inv;
    if (!inv) return "";
    const held = inv.pets.filter((p) => !this.inInventory(p.uid, p.equipped)).length + (what === "sell" ? inv.eggs.filter((e) => !this.inInventory(e.uid)).length : 0);
    return held ? `<div class="shop-note">Предметов в загоне или на панели: ${held}. Верни их в рюкзак (🎒) для ${what === "sell" ? "продажи" : "слияния"}.</div>` : "";
  }

  /** Sellable pets and eggs, with their sale price. */
  private sellList() {
    const inv = this.data.inv;
    if (!inv) return [];
    const items = [
      ...inv.pets
        .filter((p) => this.inInventory(p.uid, p.equipped))
        .map((p) => ({ uid: p.uid, value: p.income * SELL_MULT, weight: p.weight, card: (sel: boolean) => petCard(p, price(p.income * SELL_MULT), sel) })),
      ...inv.eggs
        .filter((e) => this.inInventory(e.uid))
        .map((e) => {
          const value = eggSellValue(e.defId, e.size);
          return { uid: e.uid, value, weight: e.size, card: (sel: boolean) => eggCard(e, price(value), sel) };
        }),
    ];
    return this.sellSort === "weight" ? items.sort((a, b) => b.weight - a.weight) : items.sort((a, b) => b.value - a.value);
  }

  private renderSell() {
    const items = this.sellList();
    for (const uid of [...this.sellSel]) if (!items.some((p) => p.uid === uid)) this.sellSel.delete(uid);
    const total = items.filter((p) => this.sellSel.has(p.uid)).reduce((a, p) => a + p.value, 0);
    this.sellM.body.innerHTML = `<div class="sell">
      <div class="sell-side">
        <b>Сортировка</b>
        <button class="side-btn${this.sellSort === "weight" ? " sel" : ""}" data-sort="weight">Вес</button>
        <button class="side-btn${this.sellSort === "value" ? " sel" : ""}" data-sort="value">Цена</button>
        <button class="side-btn" data-selall>Выбрать всё</button>
      </div>
      <div class="card-grid">${items.length ? items.map((p) => p.card(this.sellSel.has(p.uid))).join("") : `<div class="inv-empty">В рюкзаке нет предметов для продажи.</div>`}</div>
    </div>
    ${this.heldBackNote("sell")}
    <div class="modal-foot"><span>Общая цена <b>$${formatShort(total)}</b></span><button class="big-go" data-sell ${this.sellSel.size ? "" : "disabled"}>Продать</button></div>`;
  }

  private renderFuse() {
    const pets = [...(this.data.inv?.pets ?? [])].filter((p) => this.inInventory(p.uid, p.equipped)).sort((a, b) => a.species.localeCompare(b.species) || b.weight - a.weight);
    this.fuseSel = this.fuseSel.filter((u) => pets.some((p) => p.uid === u));
    const picked = this.fuseSel.map((u) => pets.find((p) => p.uid === u)!);
    const species = picked[0]?.species;
    const slots = Array.from({ length: FUSE.inputs }, (_, i) => {
      const p = picked[i];
      return p ? `<div class="fuse-slot full">${PET_BY_ID.get(p.species)!.icon}<small>${p.weight} кг</small></div>` : `<div class="fuse-slot">+<small>Пусто</small></div>`;
    }).join(`<span class="fuse-pipe"></span>`);
    const eligible = pets.filter((p) => !species || p.species === species);
    const ready = picked.length === FUSE.inputs;
    // Output preview: an egg of the species, with the range its weight can roll in (the server does the real roll).
    const fee = species ? fusionFee(species) : 0;
    const canPay = this.data.money >= fee;
    let out = "❓";
    let info = "Три одинаковых мутанта дают одну капсулу этого вида";
    if (ready) {
      const avg = picked.reduce((a, p) => a + p.weight, 0) / picked.length;
      const lo = rollFusionWeight(species!, [avg], 0);
      const hi = rollFusionWeight(species!, [avg], 1);
      out = `🥚<small>${esc(EGG_BY_ID.get(fusedEggId(species!))!.name)}</small>`;
      info = `Результат: ${esc(PET_BY_ID.get(species!)!.name)} · ${lo}–${hi} кг · новая попытка получить мутацию · цена <b>$${formatShort(fee)}</b>`;
    }
    this.fuseM.body.innerHTML = `<div class="fuse-top"><div class="fuse-title">Выбери одинаковых мутантов для слияния: ${FUSE.inputs}</div>
      <div class="fuse-sub">${info}</div>
      <div class="fuse-row">${slots}<span class="fuse-arrow">➜</span><div class="fuse-slot out">${out}</div></div>
      <div class="fuse-sub">⚠ Три мутанта расходуются. Новый мутант может оказаться меньше и потерять мутацию.</div></div>
      <div class="card-grid">${eligible.map((p) => petCard(p, "", this.fuseSel.includes(p.uid))).join("") || `<div class="inv-empty">Нужно три одинаковых мутанта в рюкзаке.</div>`}</div>
      ${this.heldBackNote("fuse")}
      <div class="modal-foot"><span>${!ready ? `Осталось выбрать: ${FUSE.inputs - picked.length}` : canPay ? "Готово!" : `Не хватает денег ($${formatShort(fee)})`}</span>
      <button class="big-go" data-fuse ${ready && canPay ? "" : "disabled"}>${ready ? `Объединить · $${formatShort(fee)}` : "Объединить"}</button></div>`;
  }

  private renderTrails() {
    const owned = new Set(this.data.inv?.trailsOwned ?? []);
    this.trails.headerExtra.innerHTML = `<span class="gems-pill">💵 $${formatShort(this.data.money)}</span>`;
    this.trails.body.innerHTML = `<div class="trail-row">${TRAILS.map((t) => {
      const on = this.data.trail === t.id;
      const btn = on
        ? `<button class="big-go red" data-trail-eq="">Убрать</button>`
        : owned.has(t.id)
          ? `<button class="big-go" data-trail-eq="${t.id}">Выставить</button>`
          : `<button class="big-go${this.data.money >= t.price ? "" : " no"}" data-trail-buy="${t.id}">$${formatShort(t.price)}</button>`;
      return `<div class="trail-card" style="--tc:${t.color}"><div class="tc-name">${esc(t.name)}</div>
        <div class="tc-rarity" style="color:${RARITY_COLOR[t.rarity]}">${RARITY_LABEL[t.rarity]}</div>
        <div class="tc-art"><span class="tc-streak"></span>🏃</div>
        <div class="tc-mult">Скорость ×${t.speedMult}</div>${btn}</div>`;
    }).join("")}</div>`;
  }

  // ------------------------------------------------------------------ clicks

  private wire() {
    this.shop.body.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-buy]") as HTMLElement | null;
      if (b) this.actions.shopBuy(b.dataset.buy!, b.dataset.count ? Number(b.dataset.count) : undefined);
    });
    this.index.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const page = t.closest("[data-page]") as HTMLElement | null;
      if (page) {
        const i = WORLD_BIOMES.findIndex((b) => b.id === this.indexBiome);
        const n = WORLD_BIOMES.length;
        this.indexBiome = WORLD_BIOMES[(i + Number(page.dataset.page) + n) % n].id;
        this.indexPet = "";
        return this.renderIndex();
      }
      const card = t.closest("[data-pet]") as HTMLElement | null;
      if (card) {
        this.indexPet = card.dataset.pet!;
        return this.renderIndex();
      }
      const c = t.closest("[data-claim]") as HTMLButtonElement | null;
      if (c && !c.disabled) this.actions.claim(c.dataset.claim!);
    });
    this.sellM.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const sort = t.closest("[data-sort]") as HTMLElement | null;
      if (sort) this.sellSort = sort.dataset.sort as "weight" | "value";
      else if (t.closest("[data-selall]")) {
        const all = this.sellList();
        if (this.sellSel.size === all.length) this.sellSel.clear();
        else all.forEach((p) => this.sellSel.add(p.uid));
      } else if (t.closest("[data-sell]")) {
        if (this.sellSel.size) this.actions.sell([...this.sellSel]);
        this.sellSel.clear();
      } else {
        const card = t.closest("[data-uid]") as HTMLElement | null;
        if (!card) return;
        const uid = card.dataset.uid!;
        if (this.sellSel.has(uid)) this.sellSel.delete(uid);
        else this.sellSel.add(uid);
      }
      this.renderSell();
    });
    this.fuseM.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-fuse]")) {
        if (this.fuseSel.length === FUSE.inputs) this.actions.fuse(this.fuseSel);
        this.fuseSel = [];
      } else {
        const card = t.closest("[data-uid]") as HTMLElement | null;
        if (!card) return;
        const uid = card.dataset.uid!;
        if (this.fuseSel.includes(uid)) this.fuseSel = this.fuseSel.filter((u) => u !== uid);
        else if (this.fuseSel.length < FUSE.inputs) this.fuseSel.push(uid);
      }
      this.renderFuse();
    });
    this.trails.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const buy = t.closest("[data-trail-buy]") as HTMLElement | null;
      const eq = t.closest("[data-trail-eq]") as HTMLElement | null;
      if (buy) this.actions.buyTrail(buy.dataset.trailBuy!);
      else if (eq) this.actions.equipTrail(eq.dataset.trailEq!);
    });
  }
}
