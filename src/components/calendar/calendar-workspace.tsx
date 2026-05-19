"use client";

import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";

import {
  EventDialog,
  type CalendarFormState,
  type CalendarType,
  type EventTone,
} from "@/components/calendar/event-dialog";

type CalendarView = "week" | "day" | "month";

type CalendarEvent = {
  id: string;
  title: string;
  details: string;
  date: string;
  start: string;
  end: string;
  calendar: CalendarType;
  tone: EventTone;
};

type Collaborator = {
  name: string;
  access: "Full Access" | "Limited Access";
};

const baseDate = "2025-08-13";
const hours = Array.from({ length: 9 }, (_, index) => 9 + index);
const hourHeight = 74;
const calendarTypes: CalendarType[] = [
  "Projects",
  "Events",
  "Reminders",
  "Payments",
];

const collaborators: Collaborator[] = [
  { name: "User 1", access: "Limited Access" },
  { name: "User 2", access: "Full Access" },
  { name: "User 3", access: "Full Access" },
  { name: "User 4", access: "Limited Access" },
  { name: "User 5", access: "Full Access" },
];

const initialEvents: CalendarEvent[] = [
  {
    id: "event-1",
    title: "Website Development",
    details: "Landing page alignment",
    date: "2025-08-13",
    start: "12:30",
    end: "14:00",
    calendar: "Projects",
    tone: "purple",
  },
  {
    id: "event-2",
    title: "Packaging Design",
    details: "Milano Retro Nano",
    date: "2025-08-14",
    start: "09:30",
    end: "12:00",
    calendar: "Projects",
    tone: "green",
  },
  {
    id: "event-3",
    title: "Package Design",
    details: "",
    date: "2025-08-15",
    start: "16:00",
    end: "17:00",
    calendar: "Projects",
    tone: "blue",
  },
  {
    id: "event-4",
    title: "Design Review",
    details: "Milano POS Croatia",
    date: "2025-08-16",
    start: "09:00",
    end: "11:00",
    calendar: "Events",
    tone: "purple",
  },
  {
    id: "event-5",
    title: "Poster Design",
    details: "Exhibition 2026",
    date: "2025-08-16",
    start: "12:30",
    end: "15:30",
    calendar: "Projects",
    tone: "green",
  },
  {
    id: "event-6",
    title: "Brief Creation",
    details: "Cavallo Queen POS",
    date: "2025-08-18",
    start: "09:30",
    end: "12:00",
    calendar: "Reminders",
    tone: "blue",
  },
];

const toneClasses: Record<
  EventTone,
  { card: string; edge: string; dot: string; text: string }
> = {
  green: {
    card: "bg-[#d5efd0]",
    edge: "bg-[#36b227]",
    dot: "bg-[#36b227]",
    text: "text-[#3da734]",
  },
  purple: {
    card: "bg-[#dccaf8]",
    edge: "bg-[#8d39ff]",
    dot: "bg-[#8d39ff]",
    text: "text-[#8d39ff]",
  },
  blue: {
    card: "bg-[#cfe7fb]",
    edge: "bg-[#2d99f3]",
    dot: "bg-[#2d99f3]",
    text: "text-[#2d99f3]",
  },
  amber: {
    card: "bg-[#f9ecd0]",
    edge: "bg-[#ea9d1a]",
    dot: "bg-[#ea9d1a]",
    text: "text-[#d38300]",
  },
};

const monthLabel = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const monthGridLabel = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
});

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getWeekDays(anchor: Date) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function formatWeekTitle(anchor: Date) {
  const days = getWeekDays(anchor);
  const first = days[0];
  const last = days[6];
  const month = first.toLocaleDateString("en-US", { month: "long" });
  const endMonth = last.toLocaleDateString("en-US", { month: "long" });

  if (first.getMonth() === last.getMonth()) {
    return `${month} ${first.getDate()}-${last.getDate()}, ${last.getFullYear()}`;
  }

  return `${month} ${first.getDate()}-${endMonth} ${last.getDate()}, ${last.getFullYear()}`;
}

function getEventMinutes(time: string) {
  const [hoursPart, minutesPart] = time.split(":").map(Number);
  return hoursPart * 60 + minutesPart;
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getWeeksForMonth(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(start);
  const gridEnd = addDays(startOfWeek(end), 6);
  const days: Date[] = [];

  for (let current = new Date(gridStart); current <= gridEnd; current = addDays(current, 1)) {
    days.push(new Date(current));
  }

  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

function getDefaultForm(date: string, start = "09:00", end = "10:00"): CalendarFormState {
  return {
    title: "",
    details: "",
    date,
    start,
    end,
    calendar: "Projects",
    tone: "green",
  };
}

function compareEvents(left: CalendarEvent, right: CalendarEvent) {
  return (
    parseDate(left.date).getTime() - parseDate(right.date).getTime() ||
    getEventMinutes(left.start) - getEventMinutes(right.start)
  );
}

export function CalendarWorkspace() {
  const [selectedDate, setSelectedDate] = useState<Date>(parseDate(baseDate));
  const [view, setView] = useState<CalendarView>("week");
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [filters, setFilters] = useState<Record<CalendarType, boolean>>({
    Projects: true,
    Events: true,
    Reminders: true,
    Payments: true,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("Create event");
  const [form, setForm] = useState<CalendarFormState>(getDefaultForm(baseDate));

  const visibleEvents = events
    .filter((event) => filters[event.calendar])
    .sort(compareEvents);
  const weekDays = getWeekDays(selectedDate);
  const monthWeeks = getWeeksForMonth(selectedDate);
  const upcomingEvents = visibleEvents.slice(0, 4);
  const activeWeekLabel = formatWeekTitle(selectedDate);

  function setFormValue<K extends keyof CalendarFormState>(
    field: K,
    value: CalendarFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openDialog(date: Date, start = "09:00", end = "10:00") {
    setDialogTitle("Create event");
    setForm(getDefaultForm(formatDateValue(date), start, end));
    setDialogOpen(true);
  }

  function saveEvent() {
    if (!form.title.trim()) {
      return;
    }

    if (getEventMinutes(form.end) <= getEventMinutes(form.start)) {
      return;
    }

    const nextEvent: CalendarEvent = {
      id: `event-${crypto.randomUUID()}`,
      title: form.title.trim(),
      details: form.details.trim(),
      date: form.date,
      start: form.start,
      end: form.end,
      calendar: form.calendar,
      tone: form.tone,
    };

    setEvents((current) => [...current, nextEvent].sort(compareEvents));
    setSelectedDate(parseDate(form.date));
    setDialogOpen(false);
  }

  function moveCalendar(direction: "prev" | "next") {
    const offset = direction === "next" ? 1 : -1;

    setSelectedDate((current) => {
      if (view === "month") {
        return new Date(current.getFullYear(), current.getMonth() + offset, 1);
      }

      if (view === "day") {
        return addDays(current, offset);
      }

      return addDays(current, offset * 7);
    });
  }

  function toggleFilter(type: CalendarType) {
    setFilters((current) => ({ ...current, [type]: !current[type] }));
  }

  function renderHeaderControls() {
    return (
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => moveCalendar("prev")}
            className="grid h-9 w-9 place-items-center rounded-full text-brand"
            aria-label="Previous range"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => moveCalendar("next")}
            className="grid h-9 w-9 place-items-center rounded-full text-brand"
            aria-label="Next range"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
          <h2 className="text-[18px] font-[700] tracking-[-0.03em] text-[#121713] sm:text-[20px]">
            {view === "month"
              ? monthLabel.format(selectedDate)
              : view === "day"
                ? monthGridLabel.format(selectedDate)
                : activeWeekLabel}
          </h2>
          {view === "week" ? (
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center rounded-full bg-white px-4 text-[13px] font-[600] text-[#202822] shadow-[0_8px_18px_rgba(18,34,25,0.06)]"
            >
              Week 33
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex overflow-hidden rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] p-1 text-[13px] font-[600] text-white">
            {(["week", "day", "month"] as CalendarView[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`rounded-full px-4 py-2 capitalize transition-colors ${
                  view === option
                    ? "bg-white/12 text-white"
                    : "text-white/75 hover:text-white"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openDialog(selectedDate)}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-6 text-[14px] font-[600] text-white"
          >
            Create <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  function renderMiniCalendar() {
    return (
      <section className="rounded-[20px] bg-white p-4 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[14px] font-[700] text-[#111712]">
            {monthLabel.format(selectedDate)}
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
              className="grid h-7 w-7 place-items-center rounded-full text-brand"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
              className="grid h-7 w-7 place-items-center rounded-full text-brand"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-2 text-center text-[10px] font-[600] uppercase text-[#7c847d]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-7 gap-y-2 text-center text-[12px]">
          {monthWeeks.flat().map((date) => {
            const inMonth = date.getMonth() === selectedDate.getMonth();
            const active = isSameDay(date, selectedDate);
            const dayEvents = visibleEvents.filter(
              (event) => event.date === formatDateValue(date),
            );

            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => {
                  setSelectedDate(date);
                  if (view === "month") {
                    openDialog(date);
                  }
                }}
                className={`relative mx-auto grid h-7 w-7 place-items-center rounded-md transition-colors ${
                  active
                    ? "bg-[#dff0ff] text-brand"
                    : inMonth
                      ? "text-[#2c342e] hover:bg-[#eef2ea]"
                      : "text-[#b0b5b1]"
                }`}
              >
                {date.getDate()}
                {dayEvents.length > 0 ? (
                  <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-brand" />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderUpcomingSchedules() {
    return (
      <section className="rounded-[20px] bg-white p-4 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
        <h3 className="mb-4 text-[13px] font-[700] text-[#111712]">
          Upcoming Schedules
        </h3>
        <ul className="space-y-3">
          {upcomingEvents.map((event) => {
            const tone = toneClasses[event.tone];

            return (
              <li key={event.id} className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                <div>
                  <p className={`text-[11px] leading-[1.2] ${tone.text}`}>
                    {event.title} - {event.details || event.calendar}
                  </p>
                  <p className="mt-1 text-[10px] text-[#7f877f]">
                    {monthGridLabel.format(parseDate(event.date))} at {event.start}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  function renderCalendarFilters() {
    return (
      <section className="rounded-[20px] bg-white p-4 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
        <h3 className="mb-4 text-[13px] font-[700] text-[#111712]">My Calendar</h3>
        <div className="space-y-2.5">
          {calendarTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleFilter(type)}
              className="flex items-center gap-2 text-[13px] text-[#253029]"
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded-[4px] border ${
                  filters[type]
                    ? "border-brand bg-white text-brand"
                    : "border-line bg-white text-transparent"
                }`}
              >
                <Check className="h-3 w-3" />
              </span>
              {type}
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderCollaborators() {
    return (
      <section className="rounded-[20px] bg-white p-4 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13px] font-[700] text-[#111712]">Collaborators</h3>
          <button type="button" className="text-brand" aria-label="Add collaborator">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-3">
          {collaborators.map((collaborator, index) => (
            <li key={collaborator.name} className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[11px] font-[700] text-white">
                U{index + 1}
              </div>
              <div>
                <p className="text-[13px] font-[600] text-[#232c26]">
                  {collaborator.name}
                </p>
                <p
                  className={`text-[10px] ${
                    collaborator.access === "Full Access"
                      ? "text-[#50b848]"
                      : "text-[#f29b23]"
                  }`}
                >
                  {collaborator.access}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function renderWeekOrDayView(dayCount: number) {
    const days = dayCount === 1 ? [selectedDate] : weekDays;
    const boardHeight = hours.length * hourHeight;

    return (
      <div className="rounded-[24px] bg-[#f7f8f5] p-4 sm:p-5">
        <div
          className="grid gap-0 border-b border-[#dde4dc] pb-4"
          style={{
            gridTemplateColumns: `52px repeat(${dayCount}, minmax(0, 1fr))`,
          }}
        >
          <div />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="border-l border-[#dde4dc] px-3 text-center first:border-l"
            >
              <p className="text-[12px] font-[700] uppercase text-[#1b211d]">
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p className="mt-1 text-[18px] font-[700] tracking-[-0.03em] text-[#111712]">
                {day.getDate()}
              </p>
            </div>
          ))}
        </div>

        <div className="relative mt-3">
          <div className="absolute left-0 top-0 w-[52px]">
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex h-[74px] items-start justify-start pr-2 pt-3 text-[11px] text-[#576059]"
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          <div
            className="ml-[52px] grid overflow-hidden rounded-[18px] bg-[#eef2ef]"
            style={{
              gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))`,
              height: boardHeight,
            }}
          >
            {days.map((day) => {
              const dayKey = formatDateValue(day);
              const dayEvents = visibleEvents.filter((event) => event.date === dayKey);

              return (
                <div
                  key={dayKey}
                  className="relative border-l border-[#dbe2dc] first:border-l-0"
                >
                  {hours.map((hour) => (
                    <button
                      key={`${dayKey}-${hour}`}
                      type="button"
                      onClick={() =>
                        openDialog(
                          day,
                          `${String(hour).padStart(2, "0")}:00`,
                          `${String(hour + 1).padStart(2, "0")}:00`,
                        )
                      }
                      className="block h-[74px] w-full border-t border-[#dbe2dc] text-left first:border-t-0 hover:bg-white/35"
                      aria-label={`Add event on ${dayKey} at ${formatHour(hour)}`}
                    />
                  ))}

                  {dayEvents.map((event) => {
                    const tone = toneClasses[event.tone];
                    const top =
                      ((getEventMinutes(event.start) - hours[0] * 60) / 60) *
                      hourHeight;
                    const height =
                      ((getEventMinutes(event.end) - getEventMinutes(event.start)) / 60) *
                      hourHeight;

                    return (
                      <div
                        key={event.id}
                        className={`absolute left-1.5 right-1.5 overflow-hidden rounded-[14px] ${tone.card}`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                      >
                        <div className={`absolute inset-y-0 left-0 w-1.5 ${tone.edge}`} />
                        <div className="px-3 py-3">
                          <p className={`text-[11px] font-[600] leading-[1.2] ${tone.text}`}>
                            {event.title}
                          </p>
                          {event.details ? (
                            <p className="mt-1 text-[10px] text-[#5e6b62]">
                              {event.details}
                            </p>
                          ) : null}
                          <p className={`mt-3 text-[10px] ${tone.text}`}>
                            {event.start} - {event.end}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderMonthView() {
    return (
      <div className="rounded-[24px] bg-[#f7f8f5] p-4 sm:p-5">
        <div className="grid grid-cols-7 gap-3 border-b border-[#dde4dc] pb-3">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div
              key={day}
              className="text-center text-[12px] font-[700] uppercase text-[#1b211d]"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3">
          {monthWeeks.map((week) => (
            <div key={week[0].toISOString()} className="grid grid-cols-7 gap-3">
              {week.map((date) => {
                const dayKey = formatDateValue(date);
                const dayEvents = visibleEvents.filter((event) => event.date === dayKey);
                const active = isSameDay(date, selectedDate);

                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                      openDialog(date);
                    }}
                    className={`min-h-[122px] rounded-[18px] border p-3 text-left transition-colors ${
                      active
                        ? "border-brand bg-[#edf7ef]"
                        : "border-[#e2e7e1] bg-white hover:border-brand/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[13px] font-[700] ${
                          date.getMonth() === selectedDate.getMonth()
                            ? "text-[#131813]"
                            : "text-[#a7aea8]"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {dayEvents.length > 0 ? (
                        <span className="rounded-full bg-brand-soft px-2 py-1 text-[10px] font-[600] text-brand">
                          {dayEvents.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {dayEvents.slice(0, 2).map((event) => {
                        const tone = toneClasses[event.tone];

                        return (
                          <div
                            key={event.id}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-[600] ${tone.card} ${tone.text}`}
                          >
                            {event.start} {event.title}
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
            Calendar
          </h1>
        </header>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[174px_minmax(0,1fr)]">
          <div className="space-y-4">
            {renderMiniCalendar()}
            {renderUpcomingSchedules()}
            {renderCalendarFilters()}
            {renderCollaborators()}
          </div>

          <article className="rounded-[28px] bg-white p-5 shadow-[0_22px_60px_rgba(23,39,28,0.06)] sm:p-6">
            {renderHeaderControls()}
            <div className="mt-5">
              {view === "month"
                ? renderMonthView()
                : renderWeekOrDayView(view === "day" ? 1 : 7)}
            </div>
          </article>
        </section>
      </section>

      <EventDialog
        form={form}
        isOpen={dialogOpen}
        title={dialogTitle}
        onChange={setFormValue}
        onClose={() => setDialogOpen(false)}
        onSubmit={saveEvent}
      />
    </>
  );
}
