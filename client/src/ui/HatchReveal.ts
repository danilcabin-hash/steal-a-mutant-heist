import { MUTATION_BY_ID, PET_BY_ID, RARITY_COLOR, RARITY_LABEL, formatShort, petDisplayName, type HatchedMsg } from "@egg/shared";

/**
 * Hatch result card (our own addition — the reference just drops the pet in the pen):
 * rarity-colored burst, NEW! tag for first discoveries, weight and income. Click or wait to close.
 */
export class HatchReveal {
  private el: HTMLElement;
  private timer = 0;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML("beforeend", `<div class="hatch-reveal" hidden></div>`);
    this.el = root.querySelector(".hatch-reveal") as HTMLElement;
    this.el.addEventListener("click", () => this.hide());
  }

  /** `badge` overrides the corner tag (e.g. "СЛИЯНИЕ!"); by default it shows NEW! for first discoveries. */
  show(msg: HatchedMsg, badge?: string) {
    const def = PET_BY_ID.get(msg.pet.species)!;
    const mut = msg.pet.mutation ? MUTATION_BY_ID.get(msg.pet.mutation) : undefined;
    const color = RARITY_COLOR[def.rarity];
    this.el.innerHTML = `
      <div class="hr-card" style="--c:${color}">
        <div class="hr-rays"></div>
        ${badge || msg.isNew ? `<div class="hr-new">${badge ?? "НОВИНКА!"}</div>` : ""}
        <div class="hr-icon">${def.icon}</div>
        <div class="hr-rarity" style="color:${color}">${RARITY_LABEL[def.rarity]}${mut ? ` · <span style="color:${mut.color}">${mut.prefix}!</span>` : ""}</div>
        <div class="hr-name">${petDisplayName(def, msg.pet.mutation)}</div>
        <div class="hr-stats">${msg.pet.weight} кг · <b>$${formatShort(msg.pet.income)}/с</b></div>
        <div class="hr-hint">Нажми, чтобы закрыть</div>
      </div>`;
    this.el.hidden = false;
    this.el.classList.remove("show");
    void this.el.offsetWidth;
    this.el.classList.add("show");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), 4200);
  }

  hide() {
    this.el.hidden = true;
  }
}
