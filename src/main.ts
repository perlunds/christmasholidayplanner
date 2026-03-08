import Holidays from "date-holidays";
import "./styles/main.scss";

type DayInfo = {
  date: Date;
  key: string;
  label: string;
  weekdayLabel: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isWorkday: boolean;
};

type PlanOption = {
  startIndex: number;
  endIndex: number;
  totalDays: number;
  leaveDays: number;
  holidayDays: number;
  leaveKeys: Set<string>;
};

const locale = "sv-SE";
const monthDayFormatter = new Intl.DateTimeFormat(locale, {
  month: "short",
  day: "numeric",
});
const weekdayFormatter = new Intl.DateTimeFormat(locale, {
  weekday: "short",
});
const fullDateFormatter = new Intl.DateTimeFormat(locale, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const yearButtonsHost = document.querySelector<HTMLElement>(
  "[data-year-buttons]",
);
const budgetInput = document.querySelector<HTMLInputElement>(
  "[data-input='budget']",
);
const budgetValue = document.querySelector<HTMLOutputElement>(
  "[data-value='budget']",
);
const resultsHost = document.querySelector<HTMLElement>("[data-results]");

const currentYear = new Date().getFullYear();
const selectableYears = [currentYear, currentYear + 1, currentYear + 2];
let yearButtons: HTMLButtonElement[] = [];
let selectedYear = currentYear;

if (budgetInput) {
  budgetInput.value = "3";
}

function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAtNoon(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDaysInclusive(start: Date, end: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / oneDay) + 1;
}

function addManualChristmasHolidays(
  map: Map<string, string>,
  year: number,
): void {
  map.set(`${year}-12-24`, "Julafton");
  map.set(`${year}-12-31`, "Ny\u00e5rsafton");
}

function createHolidayMap(targetYear: number): Map<string, string> {
  const hd = new Holidays("SE");
  hd.setLanguages("sv");

  const map = new Map<string, string>();
  const all = [
    ...hd.getHolidays(targetYear),
    ...hd.getHolidays(targetYear + 1),
  ];

  for (const item of all) {
    if (item.type !== "public") {
      continue;
    }

    const startDate =
      item.start instanceof Date ? item.start : new Date(item.date);
    const key = toKey(startDate);

    if (map.has(key)) {
      const existing = map.get(key);
      map.set(key, `${existing} / ${item.name}`);
    } else {
      map.set(key, item.name);
    }
  }

  addManualChristmasHolidays(map, targetYear);

  return map;
}

function buildChristmasWindow(
  targetYear: number,
  holidayMap: Map<string, string>,
): DayInfo[] {
  const start = dateAtNoon(targetYear, 11, 19);
  const end = dateAtNoon(targetYear + 1, 0, 11);

  const length = diffDaysInclusive(start, end);
  const days: DayInfo[] = [];

  for (let i = 0; i < length; i += 1) {
    const date = addDays(start, i);
    const key = toKey(date);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const holidayName = holidayMap.get(key);
    const isHoliday = Boolean(holidayName);
    const isWorkday = !isWeekend && !isHoliday;

    days.push({
      date,
      key,
      label: monthDayFormatter.format(date),
      weekdayLabel: weekdayFormatter.format(date),
      isWeekend,
      isHoliday,
      holidayName,
      isWorkday,
    });
  }

  return days;
}

function normalizeRange(
  days: DayInfo[],
  startIndex: number,
  endIndex: number,
): { startIndex: number; endIndex: number } {
  let normalizedStart = startIndex;
  let normalizedEnd = endIndex;

  while (normalizedStart > 0 && !days[normalizedStart - 1].isWorkday) {
    normalizedStart -= 1;
  }

  while (
    normalizedEnd < days.length - 1 &&
    !days[normalizedEnd + 1].isWorkday
  ) {
    normalizedEnd += 1;
  }

  return { startIndex: normalizedStart, endIndex: normalizedEnd };
}

function compareOptions(a: PlanOption, b: PlanOption): number {
  if (b.totalDays !== a.totalDays) {
    return b.totalDays - a.totalDays;
  }
  if (a.leaveDays !== b.leaveDays) {
    return a.leaveDays - b.leaveDays;
  }
  if (b.holidayDays !== a.holidayDays) {
    return b.holidayDays - a.holidayDays;
  }
  return a.startIndex - b.startIndex;
}

function findBestOptions(days: DayInfo[], maxLeaveDays: number): PlanOption[] {
  const options: PlanOption[] = [];

  for (let startIndex = 0; startIndex < days.length; startIndex += 1) {
    let leaveDays = 0;

    for (let endIndex = startIndex; endIndex < days.length; endIndex += 1) {
      if (days[endIndex].isWorkday) {
        leaveDays += 1;
      }

      if (leaveDays > maxLeaveDays) {
        break;
      }

      const leaveKeys = new Set<string>();
      let holidayDays = 0;

      for (let i = startIndex; i <= endIndex; i += 1) {
        if (days[i].isHoliday) {
          holidayDays += 1;
        }

        if (days[i].isWorkday) {
          leaveKeys.add(days[i].key);
        }
      }

      const normalized = normalizeRange(days, startIndex, endIndex);

      options.push({
        startIndex: normalized.startIndex,
        endIndex: normalized.endIndex,
        totalDays: normalized.endIndex - normalized.startIndex + 1,
        leaveDays,
        holidayDays,
        leaveKeys,
      });
    }
  }

  const unique = new Map<string, PlanOption>();

  for (const option of options) {
    const leaveSignature = [...option.leaveKeys].sort().join("|");
    const key = `${option.startIndex}-${option.endIndex}-${leaveSignature}`;
    const existing = unique.get(key);

    if (!existing || compareOptions(option, existing) < 0) {
      unique.set(key, option);
    }
  }

  return [...unique.values()].sort(compareOptions).slice(0, 5);
}

function createTimeline(days: DayInfo[], option: PlanOption): HTMLElement {
  const line = document.createElement("div");
  line.className = "timeline";

  for (let i = option.startIndex; i <= option.endIndex; i += 1) {
    const day = days[i];
    const cell = document.createElement("div");
    cell.className = "timeline__day";

    const leaveUsed = option.leaveKeys.has(day.key);

    if (leaveUsed) {
      cell.classList.add("timeline__day--leave");
    } else if (day.isHoliday) {
      cell.classList.add("timeline__day--holiday");
    } else {
      cell.classList.add("timeline__day--weekend");
    }

    cell.title = `${fullDateFormatter.format(day.date)}${day.holidayName ? ` - ${day.holidayName}` : ""}`;

    const weekday = document.createElement("span");
    weekday.className = "timeline__weekday";
    weekday.textContent = day.weekdayLabel;

    const date = document.createElement("span");
    date.className = "timeline__date";
    date.textContent = day.label;

    cell.append(weekday, date);
    line.append(cell);
  }

  return line;
}

function renderResults(year: number, budget: number): void {
  if (!resultsHost) {
    return;
  }

  const holidayMap = createHolidayMap(year);
  const days = buildChristmasWindow(year, holidayMap);
  const options = findBestOptions(days, budget);

  resultsHost.innerHTML = "";

  if (options.length === 0) {
    resultsHost.textContent =
      "Inga f\u00f6rslag hittades f\u00f6r vald period.";
    return;
  }

  const periodSummary = document.createElement("p");
  periodSummary.className = "results__period";
  periodSummary.textContent = `* Ber\u00e4kningsperiod: ${fullDateFormatter.format(days[0].date)} - ${fullDateFormatter.format(days[days.length - 1].date)}`;
  resultsHost.append(periodSummary);

  options.forEach((option, index) => {
    const card = document.createElement("article");
    card.className = "option";
    if (index === 0) {
      card.classList.add("option--best");
    }

    const start = days[option.startIndex].date;
    const end = days[option.endIndex].date;

    const heading = document.createElement("h2");
    heading.className = "option__title";
    heading.textContent =
      index === 0 ? "B\u00e4sta alternativ" : `Alternativ ${index + 1}`;

    if (index === 0) {
      const star = document.createElement("span");
      star.className = "option__star";
      heading.append(star);
    }

    const summary = document.createElement("p");
    summary.className = "option__summary";
    summary.textContent = `${fullDateFormatter.format(start)} - ${fullDateFormatter.format(end)}. ${option.totalDays} dagar ledigt med ${option.leaveDays} semesterdagar.`;

    const timeline = createTimeline(days, option);

    card.append(heading, summary, timeline);
    resultsHost.append(card);
  });
}

function setSelectedYear(nextYear: number): void {
  selectedYear = nextYear;

  for (const button of yearButtons) {
    const buttonYear = Number(button.dataset.year);
    const isActive = buttonYear === selectedYear;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  renderFromControls();
}

function renderFromControls(): void {
  const budget = Number(budgetInput?.value ?? 3);

  if (budgetValue) {
    budgetValue.textContent = `${budget} dagar`;
  }

  renderResults(selectedYear, budget);
}

function renderYearButtons(): void {
  if (!yearButtonsHost) {
    return;
  }

  yearButtonsHost.innerHTML = "";

  yearButtons = selectableYears.map((year) => {
    const button = document.createElement("button");
    button.className = "year-button";
    button.type = "button";
    button.dataset.year = String(year);
    button.textContent = String(year);
    button.addEventListener("click", () => {
      setSelectedYear(year);
    });
    yearButtonsHost.append(button);
    return button;
  });
}

budgetInput?.addEventListener("input", renderFromControls);

renderYearButtons();
setSelectedYear(selectedYear);
