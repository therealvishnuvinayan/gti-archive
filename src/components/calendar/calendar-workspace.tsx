"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import { saveCalendarEventAction } from "@/app/(dashboard)/calendar/actions";
import {
  CalendarMonthGrid,
  getCalendarMonthWeeks,
  formatCalendarDateValue,
  isSameCalendarDay,
  parseCalendarDateValue,
} from "@/components/calendar/calendar-month-grid";
import {
  CollaboratorDialog,
  type AccessArea,
  type CollaboratorForm,
  type PermissionLevel,
} from "@/components/collaboration/collaborator-dialog";
import {
  EventDialog,
  type CalendarFormState,
  type CalendarType,
  type EventTone,
} from "@/components/calendar/event-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CalendarEventRecord,
  SaveCalendarEventInput,
} from "@/lib/calendar";
import type { CollaboratorRecord } from "@/lib/collaboration";

type CalendarView = "week" | "day" | "month";

type CalendarWorkspaceProps = {
  initialEvents: CalendarEventRecord[];
  collaborators: CollaboratorRecord[];
};

const hours = Array.from({ length: 9 }, (_, index) => 9 + index);
const hourHeight = 74;
const calendarTypes: CalendarType[] = ["Projects", "Events", "Reminders", "Payments"];
const today = new Date();


const toneClasses: Record<
  EventTone,
  { card: string; edge: string; dot: string; text: string }
> = {
  green: {
    card: "bg-[#d5efd0]",
    edge: "bg-[#36b227]",
    dot: "bg-[#36b227]",
    text: "text-[#31952a]",
  },
  purple: {
    card: "bg-[#dccaf8]",
    edge: "bg-[#8d39ff]",
    dot: "bg-[#8d39ff]",
    text: "text-[#8039eb]",
  },
  blue: {
    card: "bg-[#cfe7fb]",
    edge: "bg-[#2d99f3]",
    dot: "bg-[#2d99f3]",
    text: "text-[#2b87df]",
  },
  amber: {
    card: "bg-[#f9ecd0]",
    edge: "bg-[#ea9d1a]",
    dot: "bg-[#ea9d1a]",
    text: "text-[#c97f07]",
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

function getIsoWeekNumber(date: Date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getEventMinutes(time: string) {
  const [hoursPart, minutesPart] = time.split(":").map(Number);
  return hoursPart * 60 + minutesPart;
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
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

function compareEvents(left: CalendarEventRecord, right: CalendarEventRecord) {
  return parseCalendarDateValue(left.date).getTime() - parseCalendarDateValue(right.date).getTime() ||
    getEventMinutes(left.start) - getEventMinutes(right.start);
}

function buildWeekOptions(anchor: Date) {
  const currentWeekStart = startOfWeek(anchor);

  return Array.from({ length: 9 }, (_, index) => {
    const date = addDays(currentWeekStart, (index - 4) * 7);

    return {
      value: formatCalendarDateValue(date),
      label: `Week ${getIsoWeekNumber(date)} • ${formatWeekTitle(date)}`,
    };
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CalendarWorkspace({
  initialEvents,
  collaborators,
}: CalendarWorkspaceProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [view, setView] = useState<CalendarView>("week");
  const [events, setEvents] = useState<CalendarEventRecord[]>([...initialEvents].sort(compareEvents));
  const [collaboratorRecords, setCollaboratorRecords] =
    useState<CollaboratorRecord[]>(collaborators);
  const [filters, setFilters] = useState<Record<CalendarType, boolean>>({
    Projects: true,
    Events: true,
    Reminders: true,
    Payments: true,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>();
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("Create event");
  const [collaboratorDialogOpen, setCollaboratorDialogOpen] = useState(false);
  const [collaboratorDialogError, setCollaboratorDialogError] = useState<string>();
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [collaboratorForm, setCollaboratorForm] = useState<CollaboratorForm>({
    name: "",
    email: "",
    type: "Internal",
    permissions: {
      project: "limited",
      calendar: "full",
      library: "none",
      archive: "none",
    },
  });
  const [form, setForm] = useState<CalendarFormState>(
    getDefaultForm(formatCalendarDateValue(today)),
  );

  const visibleEvents = useMemo(
    () => events.filter((event) => filters[event.calendar]).sort(compareEvents),
    [events, filters],
  );
  const weekDays = getWeekDays(selectedDate);
  const monthWeeks = getCalendarMonthWeeks(selectedDate);
  const activeWeekLabel = formatWeekTitle(selectedDate);
  const activeWeekNumber = getIsoWeekNumber(selectedDate);
  const weekOptions = buildWeekOptions(selectedDate);

  const upcomingEvents = useMemo(
    () =>
      visibleEvents
        .filter((event) => {
          const eventDateTime = new Date(`${event.date}T${event.start}:00`);
          return eventDateTime >= new Date();
        })
        .slice(0, 5),
    [visibleEvents],
  );
  const visibleCollaborators = useMemo(
    () =>
      collaboratorRecords
        .filter((collaborator) => collaborator.permissions.calendar !== "none")
        .sort((left, right) => {
          if (left.permissions.calendar === right.permissions.calendar) {
            return left.name.localeCompare(right.name);
          }

          return left.permissions.calendar === "full" ? -1 : 1;
        }),
    [collaboratorRecords],
  );

  function setFormValue<K extends keyof CalendarFormState>(
    field: K,
    value: CalendarFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setCollaboratorFormValue<K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) {
    setCollaboratorForm((current) => ({ ...current, [field]: value }));
  }

  function setCollaboratorPermissionValue(area: AccessArea, value: PermissionLevel) {
    setCollaboratorForm((current) => ({
      ...current,
      permissions: { ...current.permissions, [area]: value },
    }));
  }

  function openCollaboratorDialog() {
    setCollaboratorForm({
      name: "",
      email: "",
      type: "Internal",
      permissions: {
        project: "limited",
        calendar: "full",
        library: "none",
        archive: "none",
      },
    });
    setCollaboratorDialogError(undefined);
    setCollaboratorDialogOpen(true);
  }

  async function saveCollaborator() {
    if (!collaboratorForm.name.trim() || !collaboratorForm.email.trim()) {
      setCollaboratorDialogError("Enter both collaborator name and email.");
      return;
    }

    setCollaboratorSaving(true);
    setCollaboratorDialogError(undefined);

    try {
      const result = await saveCollaboratorAction(collaboratorForm);

      if ("error" in result) {
        setCollaboratorDialogError(result.error);
        return;
      }

      setCollaboratorRecords((current) => [...current, result.collaborator]);
      setCollaboratorDialogOpen(false);
    } catch {
      setCollaboratorDialogError(
        "Unable to save the collaborator right now. Please try again.",
      );
    } finally {
      setCollaboratorSaving(false);
    }
  }

  function openDialog(date: Date, start = "09:00", end = "10:00") {
    setDialogError(undefined);
    setDialogTitle("Create event");
    setForm(getDefaultForm(formatCalendarDateValue(date), start, end));
    setDialogOpen(true);
  }

  async function saveEvent() {
    setDialogError(undefined);
    setDialogSaving(true);

    const payload: SaveCalendarEventInput = {
      title: form.title,
      details: form.details,
      date: form.date,
      start: form.start,
      end: form.end,
      calendar: form.calendar,
      tone: form.tone,
    };

    try {
      const result = await saveCalendarEventAction(payload);

      if (!("event" in result)) {
        setDialogError(result.error);
        return;
      }

      setEvents((current) => [...current, result.event].sort(compareEvents));
      setSelectedDate(parseCalendarDateValue(result.event.date));
      setDialogOpen(false);
    } catch {
      setDialogError("Unable to save the event right now. Please try again.");
    } finally {
      setDialogSaving(false);
    }
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
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              onClick={() => moveCalendar("prev")}
              variant="ghost"
              size="icon"
              className="size-10 text-brand"
              aria-label="Previous range"
            >
              <ChevronLeft className="h-7 w-7" />
            </Button>
            <Button
              type="button"
              onClick={() => moveCalendar("next")}
              variant="ghost"
              size="icon"
              className="size-10 text-brand"
              aria-label="Next range"
            >
              <ChevronRight className="h-7 w-7" />
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="text-[18px] font-[700] tracking-[-0.03em] text-[#121713] sm:text-[20px]">
              {view === "month"
                ? monthLabel.format(selectedDate)
                : view === "day"
                  ? monthGridLabel.format(selectedDate)
                  : activeWeekLabel}
            </h2>
            {view === "week" ? (
              <div className="min-w-[230px]">
                <Select
                  value={formatCalendarDateValue(startOfWeek(selectedDate))}
                  onValueChange={(value) => setSelectedDate(parseCalendarDateValue(value))}
                >
                  <SelectTrigger className="min-h-[38px] text-[13px] font-[600] shadow-[0_8px_18px_rgba(18,34,25,0.06)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={view} onValueChange={(value) => setView(value as CalendarView)}>
            <TabsList>
              {(["week", "day", "month"] as CalendarView[]).map((option) => (
                <TabsTrigger key={option} value={option}>
                  {option}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Button
            type="button"
            onClick={() => openDialog(selectedDate)}
            className="min-h-[42px] gap-2 px-6 text-[14px]"
          >
            Create <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  function renderMiniCalendar() {
    return (
      <Card className="rounded-[20px]">
        <CardContent className="p-4">
          <CalendarMonthGrid
            month={selectedDate}
            selectedDate={selectedDate}
            onMonthChange={setSelectedDate}
            onSelect={setSelectedDate}
            markerDates={new Set(visibleEvents.map((event) => event.date))}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  function renderUpcomingSchedules() {
    return (
      <Card className="rounded-[20px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px]">Upcoming Schedules</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
        {upcomingEvents.length > 0 ? (
          <ul className="space-y-3">
            {upcomingEvents.map((event) => {
              const tone = toneClasses[event.tone];

              return (
                <li key={event.id} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                  <div>
                    <p className={`text-[11px] leading-[1.25] ${tone.text}`}>
                      {event.title} {event.details ? `- ${event.details}` : ""}
                    </p>
                    <p className="mt-1 text-[10px] text-[#7f877f]">
                    {monthGridLabel.format(parseCalendarDateValue(event.date))} at {event.start}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[12px] text-[#7f877f]">No upcoming schedules yet.</p>
        )}
        </CardContent>
      </Card>
    );
  }

  function renderCalendarFilters() {
    return (
      <Card className="rounded-[20px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px]">My Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          {calendarTypes.map((type) => (
            <Button
              key={type}
              type="button"
              onClick={() => toggleFilter(type)}
              variant="ghost"
              className="h-auto w-full justify-start gap-2 px-0 py-0 text-[13px] font-normal text-[#253029]"
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
            </Button>
          ))}
        </CardContent>
      </Card>
    );
  }

  function renderCollaborators() {
    return (
      <Card className="rounded-[20px]">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-[13px]">Collaborators</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-brand"
            onClick={openCollaboratorDialog}
            aria-label="Invite collaborator"
            title="Invite collaborator"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {visibleCollaborators.length > 0 ? (
            <ul className="space-y-3">
              {visibleCollaborators.map((collaborator) => {
                const fullAccess = collaborator.permissions.calendar === "full";

                return (
                  <li key={collaborator.id} className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[11px] font-[700] text-white">
                      {getInitials(collaborator.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-[600] text-[#232c26]">
                        {collaborator.name}
                      </p>
                      <p
                        className={`text-[10px] ${
                          fullAccess ? "text-[#50b848]" : "text-[#f29b23]"
                        }`}
                      >
                        {fullAccess ? "Full Access" : "Limited Access"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] text-[#7f877f]">
              No collaborators currently have calendar access.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderWeekOrDayView(dayCount: number) {
    const days = dayCount === 1 ? [selectedDate] : weekDays;
    const boardHeight = hours.length * hourHeight;

    return (
      <div className="rounded-[24px] bg-[#f7f8f5] p-4 sm:p-5">
        <div
          className="grid gap-0 border-b border-[#dde4dc] pb-4"
          style={{ gridTemplateColumns: `64px repeat(${dayCount}, minmax(0, 1fr))` }}
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
          <div className="absolute left-0 top-0 w-[64px]">
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex h-[74px] items-start justify-start pr-3 pt-3 text-[11px] text-[#576059]"
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          <div
            className="ml-[64px] grid overflow-hidden rounded-[18px] bg-[#eef2ef]"
            style={{
              gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))`,
              height: boardHeight,
            }}
          >
            {days.map((day) => {
              const dayKey = formatCalendarDateValue(day);
              const dayEvents = visibleEvents.filter((event) => event.date === dayKey);

              return (
                <div key={dayKey} className="relative border-l border-[#dbe2dc] first:border-l-0">
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
                      className="block h-[74px] w-full cursor-pointer border-t border-[#dbe2dc] text-left transition-colors first:border-t-0 hover:bg-white/35"
                      aria-label={`Add event on ${dayKey} at ${formatHour(hour)}`}
                    />
                  ))}

                  {dayEvents.map((event) => {
                    const tone = toneClasses[event.tone];
                    const top = ((getEventMinutes(event.start) - hours[0] * 60) / 60) * hourHeight;
                    const height =
                      ((getEventMinutes(event.end) - getEventMinutes(event.start)) / 60) * hourHeight;

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
                            <p className="mt-1 text-[10px] text-[#5e6b62]">{event.details}</p>
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
                const dayKey = formatCalendarDateValue(date);
                const dayEvents = visibleEvents.filter((event) => event.date === dayKey);
                const active = isSameCalendarDay(date, selectedDate);

                return (
                  <Button
                    key={dayKey}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                      openDialog(date);
                    }}
                    variant="secondary"
                    className={`min-h-[126px] rounded-[18px] border p-3 text-left transition-colors ${
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
                        <Badge variant="secondary" className="rounded-full bg-brand-soft px-2 py-1 text-[10px] font-[600] text-brand">
                          {dayEvents.length}
                        </Badge>
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
                  </Button>
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
      <section className="space-y-4">
        <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-4">
            {renderMiniCalendar()}
            {renderUpcomingSchedules()}
            {renderCalendarFilters()}
            {renderCollaborators()}
          </div>

          <Card className="rounded-[28px] p-5 shadow-[0_22px_60px_rgba(23,39,28,0.06)] sm:p-6">
            {renderHeaderControls()}
            <div className="mt-5">
              {visibleEvents.length === 0 ? (
                <Card className="mb-4 rounded-[18px] border border-dashed border-[#dbe2dc] bg-[#f8faf7] px-4 py-3 shadow-none">
                  No calendar events yet. Use `Create` or click a date/timeslot to add your first event.
                </Card>
              ) : null}

              {view === "month" ? (
                renderMonthView()
              ) : (
                renderWeekOrDayView(view === "day" ? 1 : 7)
              )}
            </div>
            {view === "week" ? (
              <p className="mt-4 text-[12px] text-[#7a837b]">
                Week {activeWeekNumber} selected. Click any timeslot to add a new event.
              </p>
            ) : null}
          </Card>
        </section>
      </section>

      <EventDialog
        form={form}
        error={dialogError}
        isOpen={dialogOpen}
        pending={dialogSaving}
        submitLabel="Save Event"
        title={dialogTitle}
        onChange={setFormValue}
        onClose={() => {
          setDialogError(undefined);
          setDialogOpen(false);
        }}
        onSubmit={saveEvent}
      />
      <CollaboratorDialog
        isOpen={collaboratorDialogOpen}
        mode="invite"
        form={collaboratorForm}
        error={collaboratorDialogError}
        saving={collaboratorSaving}
        onClose={() => {
          setCollaboratorDialogError(undefined);
          setCollaboratorDialogOpen(false);
        }}
        onSubmit={saveCollaborator}
        onChange={setCollaboratorFormValue}
        onPermissionChange={setCollaboratorPermissionValue}
      />
    </>
  );
}
