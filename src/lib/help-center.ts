import type { ComponentType } from "react";
import {
  Archive,
  ArrowUpFromLine,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileArchive,
  FolderKanban,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UserRoundPlus,
  Users,
  Workflow,
} from "lucide-react";

export type HelpIcon = ComponentType<{ className?: string }>;

export type HelpQuickStartItem = {
  id: string;
  title: string;
  description: string;
  sectionId: string;
  icon: HelpIcon;
  keywords: string[];
};

export type HelpTopic = {
  id: string;
  title: string;
  description: string;
  sectionId: string;
  icon: HelpIcon;
  keywords: string[];
};

export type HelpGuide = {
  id: string;
  title: string;
  description: string;
  sectionId: string;
  keywords: string[];
};

export type HelpSectionBlock = {
  title: string;
  items: string[];
  ordered?: boolean;
};

export type HelpQuestion = {
  question: string;
  answer: string;
};

export type HelpSection = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  keywords: string[];
  blocks: HelpSectionBlock[];
  callout?: string;
  questions?: HelpQuestion[];
};

export const helpCenterIntro = {
  title: "Help Center",
  subtitle:
    "Learn how GTI Archive works, from project creation to collaboration, approvals, archives, and completion workflows.",
  searchPlaceholder: "Search help topics, workflows, and guides...",
};

export const quickStartItems: HelpQuickStartItem[] = [
  {
    id: "quick-create-project",
    title: "Create a project",
    description: "Set up the project name, brief, category, dates, budget, and priority.",
    sectionId: "projects",
    icon: FolderKanban,
    keywords: ["project", "create", "brief", "budget", "priority", "category"],
  },
  {
    id: "quick-stage-budget",
    title: "Add project stages and budgets",
    description: "Break work into stages with names, dates, budgets, and stage briefs.",
    sectionId: "project-lifecycle",
    icon: Workflow,
    keywords: ["stage", "budget", "timeline", "due date", "stage brief"],
  },
  {
    id: "quick-assign-executor",
    title: "Assign a project executor",
    description: "Choose the person or company responsible for executing the work.",
    sectionId: "projects",
    icon: CheckCircle2,
    keywords: ["executor", "assign", "owner", "responsibility"],
  },
  {
    id: "quick-invite-collaborators",
    title: "Invite collaborators",
    description: "Add internal or external collaborators and give them the right access.",
    sectionId: "collaboration-permissions",
    icon: UserRoundPlus,
    keywords: ["collaborator", "invite", "permissions", "internal", "external"],
  },
  {
    id: "quick-upload-files",
    title: "Upload project files",
    description: "Store briefs, working attachments, submissions, and supporting files.",
    sectionId: "library-archives",
    icon: ArrowUpFromLine,
    keywords: ["upload", "attachments", "files", "library", "assets"],
  },
  {
    id: "quick-submit-work",
    title: "Submit work for review",
    description: "Executors submit work for the project owner to review or revise.",
    sectionId: "submissions-revisions",
    icon: ClipboardCheck,
    keywords: ["submit work", "review", "revision", "executor"],
  },
  {
    id: "quick-complete-archive",
    title: "Complete and archive a project",
    description: "Finish the final stage, rename final files if needed, and move them to Archives.",
    sectionId: "project-completion",
    icon: Archive,
    keywords: ["archive", "complete project", "final files", "completion checklist"],
  },
];

export const helpTopics: HelpTopic[] = [
  {
    id: "topic-dashboard",
    title: "Dashboard & Navigation",
    description: "Understand dashboard cards, updates, reminders, recent projects, and the sidebar.",
    sectionId: "dashboard-navigation",
    icon: LayoutDashboard,
    keywords: ["dashboard", "navigation", "recent projects", "important updates", "reminders"],
  },
  {
    id: "topic-projects",
    title: "Projects",
    description: "Create, edit, organize, and track projects with owners, executors, stages, and budgets.",
    sectionId: "projects",
    icon: FolderKanban,
    keywords: ["projects", "budget", "executor", "priority", "project overview"],
  },
  {
    id: "topic-stages",
    title: "Project Brief and Stage Brief",
    description: "Learn the difference between the main project brief and stage-specific briefs.",
    sectionId: "stages-briefs",
    icon: Workflow,
    keywords: ["stages", "project brief", "stage brief", "accept brief", "stage chat"],
  },
  {
    id: "topic-submissions",
    title: "Submissions & Revisions",
    description: "Follow the review cycle from Submit Work to revision requests and stage completion.",
    sectionId: "submissions-revisions",
    icon: ClipboardCheck,
    keywords: ["submission", "revision", "mark as complete", "request revision", "review"],
  },
  {
    id: "topic-collaboration",
    title: "Collaboration & Permissions",
    description: "Understand roles, collaborator types, project participants, and server-enforced access.",
    sectionId: "collaboration-permissions",
    icon: Users,
    keywords: ["collaboration", "permissions", "roles", "project owner", "project executor"],
  },
  {
    id: "topic-library",
    title: "Library & Archives",
    description: "Keep working files in Library and final completed files in Archives.",
    sectionId: "library-archives",
    icon: FileArchive,
    keywords: ["library", "archives", "favorites", "preview", "download", "delete file"],
  },
  {
    id: "topic-completion",
    title: "Project Completion",
    description: "Complete the final stage, archive final files, and manage approval, copyright, and invoice steps.",
    sectionId: "project-completion",
    icon: Archive,
    keywords: ["project completion", "approval", "copyright", "invoice", "final stage"],
  },
  {
    id: "topic-calendar",
    title: "Calendar",
    description: "Use Month, Week, and Day views, filters, schedules, and collaborator visibility.",
    sectionId: "calendar",
    icon: CalendarDays,
    keywords: ["calendar", "month view", "events", "reminders", "payments", "filters"],
  },
  {
    id: "topic-notifications",
    title: "Notifications & Mentions",
    description: "Track workflow updates, mentions, unread items, and notification polling behavior.",
    sectionId: "notifications-mentions",
    icon: Bell,
    keywords: ["notifications", "mentions", "unread", "polling", "bell", "workflow updates"],
  },
  {
    id: "topic-settings",
    title: "Settings, Users & Master Data",
    description: "Manage your profile, password, categories, tags, currencies, users, and permission profiles.",
    sectionId: "settings-users-master-data",
    icon: Settings2,
    keywords: ["settings", "users", "categories", "tags", "currencies", "master data"],
  },
  {
    id: "topic-user-permissions",
    title: "User Permissions",
    description: "Manage user role assignments and global permission profiles safely from the Users page.",
    sectionId: "user-permissions",
    icon: ShieldCheck,
    keywords: ["user permissions", "manage permissions", "roles", "collaborator type", "permission profiles"],
  },
  {
    id: "topic-troubleshooting",
    title: "Troubleshooting",
    description: "Find fixes for missing access, upload delays, budget visibility, calendar visibility, and notifications.",
    sectionId: "troubleshooting",
    icon: CircleHelp,
    keywords: ["troubleshooting", "cannot see project", "upload slow", "calendar item not visible"],
  },
];

export const recommendedGuides: HelpGuide[] = [
  {
    id: "guide-create-project",
    title: "How to create a new project",
    description: "Create the project record, brief, category, executor, dates, and priority.",
    sectionId: "projects",
    keywords: ["create project", "brief", "executor", "priority"],
  },
  {
    id: "guide-stage-budgets",
    title: "How to add stages and budgets",
    description: "Plan each stage without letting the stage total exceed the project budget.",
    sectionId: "project-lifecycle",
    keywords: ["stage budget", "budget conflict", "stage dates"],
  },
  {
    id: "guide-assign-executor",
    title: "How to assign a project executor",
    description: "Choose the executor and understand what they can do once the project opens.",
    sectionId: "projects",
    keywords: ["assign executor", "project executor", "owner"],
  },
  {
    id: "guide-invite-collaborators",
    title: "How to invite collaborators",
    description: "Add internal or external collaborators and give them the right project or module access.",
    sectionId: "collaboration-permissions",
    keywords: ["invite collaborator", "internal", "external", "permission profile"],
  },
  {
    id: "guide-accept-brief",
    title: "Understanding Project Brief and Stage Brief",
    description: "See how the main project requirement differs from each stage-specific instruction.",
    sectionId: "stages-briefs",
    keywords: ["project brief", "stage brief", "brief attachments"],
  },
  {
    id: "guide-stage-briefs",
    title: "How stage briefs work",
    description: "Understand how each stage can carry its own brief and attachments.",
    sectionId: "stages-briefs",
    keywords: ["stage brief", "stage chat", "attachments"],
  },
  {
    id: "guide-review-briefs-before-stage",
    title: "How executors review brief information before starting a stage",
    description: "Use the Project Brief and Stage Brief buttons in Stage Chat before accepting work.",
    sectionId: "stages-briefs",
    keywords: ["executor", "project brief", "stage brief", "accept brief"],
  },
  {
    id: "guide-stage-timer",
    title: "How the stage timer works",
    description: "The timer starts when the executor confirms they are starting work, not at project creation.",
    sectionId: "stages-briefs",
    keywords: ["timer", "start work", "waiting for executor"],
  },
  {
    id: "guide-upload-attachments",
    title: "How to upload attachments",
    description: "Use attachments for reference files and submissions for work that needs owner review.",
    sectionId: "library-archives",
    keywords: ["attachment", "upload", "submission", "files"],
  },
  {
    id: "guide-submit-review",
    title: "How to submit work for review",
    description: "Executors submit work, owners review it, and revision history stays visible.",
    sectionId: "submissions-revisions",
    keywords: ["submit work", "review", "owner", "executor"],
  },
  {
    id: "guide-request-revision",
    title: "How to request a revision",
    description: "Owners send work back with a reason and the next submission becomes the next revision number.",
    sectionId: "submissions-revisions",
    keywords: ["request revision", "revision reason", "revision history"],
  },
  {
    id: "guide-final-archive",
    title: "How final project archive works",
    description: "Complete the final stage, rename final files if needed, and move them to Archives.",
    sectionId: "project-completion",
    keywords: ["final archive", "rename final files", "complete project"],
  },
  {
    id: "guide-library-vs-archives",
    title: "How Library and Archives are different",
    description: "Understand where working files live and where final handover files are stored.",
    sectionId: "library-archives",
    keywords: ["library vs archives", "working files", "final files"],
  },
  {
    id: "guide-permissions",
    title: "How permissions work",
    description: "Understand role profiles, collaborator type profiles, and why access is enforced server-side.",
    sectionId: "collaboration-permissions",
    keywords: ["permissions", "role profile", "collaborator type", "access denied"],
  },
  {
    id: "guide-user-permissions",
    title: "How to manage User Permissions",
    description: "Use the Users page to assign roles and maintain global permission profiles without per-user overrides.",
    sectionId: "user-permissions",
    keywords: ["user permissions", "manage permissions", "users page", "roles", "collaborator type"],
  },
  {
    id: "guide-notifications",
    title: "How notifications and mentions work",
    description: "Use bell notifications, @mentions, and workflow alerts without relying on manual refresh.",
    sectionId: "notifications-mentions",
    keywords: ["notifications", "mentions", "polling", "bell"],
  },
  {
    id: "guide-calendar",
    title: "How calendar schedules work",
    description: "Use Month, Week, and Day views and filter Projects, Events, Reminders, and Payments.",
    sectionId: "calendar",
    keywords: ["calendar", "month", "week", "day", "filters"],
  },
  {
    id: "guide-checklist",
    title: "How the project completion checklist works",
    description: "Manage authority approval, copyright transfer, and invoicing after project completion.",
    sectionId: "project-completion",
    keywords: ["completion checklist", "authority approval", "copyright", "invoice"],
  },
];

export const helpSections: HelpSection[] = [
  {
    id: "what-is-gti-archive",
    eyebrow: "Product Overview",
    title: "What is GTI Archive?",
    summary:
      "GTI Archive is an internal PMS and archive portal for creating projects, assigning work, collaborating in controlled stage chat, reviewing submissions, archiving final files, and tracking post-completion documents.",
    keywords: ["product overview", "what is gti archive", "pms", "asset archive"],
    blocks: [
      {
        title: "What the platform helps you manage",
        items: [
          "Projects, stages, budgets, timelines, and ownership in one operational dashboard.",
          "Controlled collaboration between project owners, executors, and internal or external collaborators.",
          "File traceability across briefs, chat attachments, submissions, completion documents, Library, and Archives.",
          "Structured review flows for submissions, revisions, approvals, and final archive handover.",
        ],
      },
      {
        title: "What GTI Archive is not",
        items: [
          "It is not a marketing site or public support center.",
          "It is not an unstructured file drop; files remain tied to workflow context and permissions.",
          "It is not a client-facing support portal. The Help Center teaches the product workflow end-to-end.",
        ],
      },
    ],
    callout:
      "The core lifecycle is: create project, assign executor, accept brief, discuss stage work, submit work, review or revise, complete stages, archive final files, and finish post-project documents.",
  },
  {
    id: "project-lifecycle",
    eyebrow: "Core Workflow",
    title: "Project lifecycle",
    summary:
      "Every project follows a structured lifecycle so work, files, reviews, and completion records stay traceable from start to archive.",
    keywords: ["project lifecycle", "workflow", "create project", "archive"],
    blocks: [
      {
        title: "End-to-end workflow",
        ordered: true,
        items: [
          "Create the project and define the brief, executor, stages, budget, dates, and collaborators.",
          "Attach project brief files if needed and add stage briefs for the stage-level work.",
          "The first stage opens with project brief context and the Stage 1 Brief in stage chat.",
          "The executor reviews the Project Brief and Stage Brief, then clicks Accept Brief / Start Work.",
          "Stage discussion, attachments, mentions, and working collaboration continue inside the stage chat.",
          "The executor submits work for owner review.",
          "The project owner marks the submission complete or requests a revision with a reason.",
          "The cycle repeats until the stage is accepted.",
          "The final stage completion opens the archive and post-completion flow.",
          "Final files are renamed if needed, moved to Archives, and the chat becomes view-only.",
          "Authority approval, copyright transfer, and invoice steps continue through the completion checklist.",
        ],
      },
      {
        title: "Why the lifecycle matters",
        items: [
          "Each action is tied to the responsible role, so ownership is clear.",
          "Files stay attached to the exact project, stage, revision, or completion step where they were used.",
          "Completion documents remain separate from normal working files so final handover is cleaner.",
        ],
      },
    ],
  },
  {
    id: "dashboard-navigation",
    eyebrow: "Workspace Overview",
    title: "Dashboard & navigation",
    summary:
      "The Dashboard is the fastest way to see what needs attention, while the sidebar gives you consistent access to core modules.",
    keywords: ["dashboard", "navigation", "recent projects", "upload assets", "important updates"],
    blocks: [
      {
        title: "What the Dashboard shows",
        items: [
          "Real scoped project counts for total, ongoing, pending or paused, and completed work.",
          "Important updates and reminders pulled from actual workflow activity or notifications.",
          "Recent projects, progress, collaboration context, and nearest deadlines when real data exists.",
          "Quick actions such as New Project and Upload Assets, where Upload Assets takes users into Library.",
        ],
      },
      {
        title: "How to use navigation",
        items: [
          "Use the sidebar to move between Dashboard, Projects, Calendar, Collaboration, Notifications, Library, Archives, Settings, and Help.",
          "Use the top notification bell to review recent workflow alerts and open the full notifications page.",
          "Treat the Dashboard as an overview, then open the relevant module when you need to act.",
        ],
      },
    ],
    questions: [
      {
        question: "Why does the Dashboard not show every project?",
        answer:
          "Dashboard data is scoped to what the signed-in user is allowed to see. It should not leak inaccessible project names, counts, or deadlines.",
      },
    ],
  },
  {
    id: "projects",
    eyebrow: "Project Setup",
    title: "Projects",
    summary:
      "Project creation establishes the owner, brief, executor, financial boundaries, schedule, stages, and collaboration context for the rest of the workflow.",
    keywords: ["projects", "create project", "priority", "budget", "executor", "tag", "category"],
    blocks: [
      {
        title: "Project details you define",
        items: [
          "Project Name and Project Brief are the required core fields. The Project Brief is the main project-level requirement.",
          "Project Category and Project Tag come from Project Master Data, with quick-add support from the form.",
          "Project Executor is mandatory and is the person or company responsible for execution.",
          "Project Status, Project Priority, timeline dates, and collaborators shape the working context shown across the system.",
          "Project Brief attachments stay at project level and apply across the whole project.",
        ],
      },
      {
        title: "Budget and visibility rules",
        items: [
          "The project budget is the total financial ceiling for the project.",
          "The combined stage budget total cannot exceed the project budget.",
          "Budget conflicts should be blocked with clear inline feedback and toasts.",
          "Budget and currency must not be exposed to unauthorized users. By current business rule, the project owner controls budget visibility.",
        ],
      },
      {
        title: "What the overview panel tells you",
        items: [
          "The create and edit pages keep a running overview of budget, allocated stages, remaining budget, executor, tag, status, priority, and stage count.",
          "The project creator becomes Project Owner automatically and remains the submission reviewer by business rule.",
        ],
      },
    ],
    callout:
      "Project Priority is optional and defaults to Medium. Use it to signal urgency without replacing the project status.",
  },
  {
    id: "stages-briefs",
    eyebrow: "Stage Work",
    title: "Project Brief and Stage Brief",
    summary:
      "A Project Brief explains the full project requirement. A Stage Brief explains what needs to happen in the current stage.",
    keywords: ["stages", "project brief", "stage brief", "accept brief", "timer"],
    blocks: [
      {
        title: "Brief types",
        items: [
          "Project Brief is the main project-level requirement and applies across the whole project.",
          "Stage Brief is the stage-specific instruction and applies only to the current stage.",
          "Each stage can have its own Stage Brief, budget, planned start date, and planned due date.",
          "Stage Brief replaces the old Stage Description wording in the product.",
          "Attachments can be linked to project briefs or stage briefs where available.",
        ],
      },
      {
        title: "How stage briefs work",
        items: [
          "Stage 1 can have a different Stage Brief from Stage 2 or later stages.",
          "When an executor opens Stage 1, they should review the Project Brief and the Stage 1 Brief.",
          "When an executor opens Stage 2, they should review the Project Brief and the Stage 2 Brief.",
          "Stage Chat keeps separate Project Brief and Stage Brief buttons so the context is clear.",
        ],
      },
      {
        title: "How executors review brief information before starting a stage",
        ordered: true,
        items: [
          "Open Stage Chat for the current stage.",
          "Use Project Brief to review the main project-level requirement and project brief attachments.",
          "Use Stage Brief to review the current stage instruction and stage brief attachments.",
          "The executor clicks Accept Brief / Start Work to confirm they are beginning the stage.",
          "Only after acceptance does the stage timer start.",
          "Before acceptance, the timer should remain in a not-started or waiting state.",
        ],
      },
      {
        title: "Why this matters",
        items: [
          "The timer tracks actual work start, not project creation time.",
          "It protects executors from being timed before they have acknowledged the brief.",
          "It gives owners a clear handoff point between planning and execution.",
        ],
      },
    ],
  },
  {
    id: "submissions-revisions",
    eyebrow: "Review Flow",
    title: "Submissions & revisions",
    summary:
      "Submissions are formal work outputs from the executor. They move through owner review, revision requests, and completion while preserving revision history.",
    keywords: ["submissions", "revisions", "submit work", "mark as complete", "request revision"],
    blocks: [
      {
        title: "Attachments versus submissions",
        items: [
          "Attachments are normal discussion or reference files used in stage chat.",
          "Submissions are formal executor work outputs that must be reviewed by the project owner.",
          "Only the project executor can submit work; normal collaborators can upload attachments if allowed but cannot submit revisions.",
        ],
      },
      {
        title: "Review cycle",
        ordered: true,
        items: [
          "The executor submits work.",
          "The project owner reviews the submission.",
          "The owner chooses Mark as Complete to accept the work, or Request Revision to send it back.",
          "Revision requests require a reason or explanation.",
          "The executor submits the next revision, which becomes the next numbered submission in history.",
        ],
      },
      {
        title: "Business rules to remember",
        items: [
          "Only the project owner reviews and completes submissions.",
          "Old revisions remain visible as project history and should not disappear when a new revision is submitted.",
          "A rejected Revision 1 stays part of the record while the next submission becomes Revision 2.",
        ],
      },
    ],
  },
  {
    id: "collaboration-permissions",
    eyebrow: "People & Access",
    title: "Collaboration & permissions",
    summary:
      "GTI Archive combines global roles, collaborator types, project-specific responsibilities, and server-enforced permission profiles to decide what each user can see and do.",
    keywords: ["collaboration", "permissions", "super admin", "admin", "collaborator", "project owner", "project executor"],
    blocks: [
      {
        title: "Roles and responsibilities",
        items: [
          "SUPER_ADMIN manages users, permission profiles, master data, and broad system administration.",
          "ADMIN manages day-to-day projects and collaboration workflows within their allowed scope.",
          "COLLABORATOR accesses only assigned projects or allowed modules.",
          "Project Owner controls the project, budget, submission review, and final completion authority.",
          "Project Executor accepts briefs, starts work, and submits revisions for review.",
        ],
      },
      {
        title: "Permission model",
        items: [
          "Permissions are profile-based by role and collaborator type, not manually tuned user-by-user at scale.",
          "Collaborator types such as internal client, agency, freelancer, vendor, or client of GTI shape default access expectations.",
          "Hard business rules still apply even when broader permissions exist. For example, only the owner reviews submissions and only the executor submits work.",
          "Sensitive fields and protected actions must be enforced server-side, not only hidden in the UI.",
        ],
      },
      {
        title: "Why access can differ by user",
        items: [
          "Project membership affects whether a collaborator can see a project at all.",
          "Field-level filtering can hide sensitive values such as budget even when the user can see the project.",
          "Calendar, Library, Archive, and project chat visibility can differ based on the assigned profile and workflow role.",
        ],
      },
    ],
  },
  {
    id: "user-permissions",
    eyebrow: "Access Administration",
    title: "User Permissions",
    summary:
      "User Permissions are managed from the Users page by assigning user roles, assigning collaborator types, and editing global permission profiles.",
    keywords: ["user permissions", "manage permissions", "users page", "roles", "collaborator type", "permission profiles", "hard rules"],
    blocks: [
      {
        title: "What the Users page controls",
        items: [
          "User role assignment: SUPER_ADMIN, ADMIN, or COLLABORATOR.",
          "Collaborator type assignment, such as GTI internal client, sister company internal client, freelancer, agency, vendor, or client of GTI.",
          "Global role permission profiles and collaborator type permission profiles through Manage Permissions.",
          "Permission definition sync after a new permission key is added to the product.",
        ],
      },
      {
        title: "How effective permissions are calculated",
        ordered: true,
        items: [
          "The user receives the permissions enabled for their role profile.",
          "If the user is a COLLABORATOR, those role permissions are further limited by their collaborator type profile.",
          "SUPER_ADMIN keeps critical user and permission management permissions even when saved profiles are edited.",
          "Project ownership, executor status, and membership hard rules are checked after the global permission profile allows an action.",
        ],
      },
      {
        title: "Important hard rules",
        items: [
          "Project budget visibility and budget edits remain owner-controlled.",
          "Only the project executor accepts briefs, submits stage work, and uploads formal submissions.",
          "Only the project owner reviews submissions, requests revisions, completes stages, and completes the final archive.",
          "Checklist actions for approval proof and copyright documents remain owner-only, while invoice upload is owner-or-executor when permitted.",
          "Users and permission profile management remain SUPER_ADMIN-only in the current product.",
        ],
      },
      {
        title: "Recommended admin workflow",
        ordered: true,
        items: [
          "Open Users and confirm the person has the correct role and collaborator type.",
          "Open Manage Permissions and choose the relevant role profile or collaborator type profile.",
          "Search for the permission key or select the permission group, then enable or disable the capability.",
          "Save the profile and let active sessions refresh. The app also refreshes permission-sensitive caches.",
          "If a newly developed permission is missing, run Sync Definitions from the Manage Permissions modal or run pnpm permissions:sync from the project.",
        ],
      },
    ],
    callout:
      "Do not solve access problems by creating one-off per-user exceptions. Prefer role and collaborator type profiles so access stays predictable.",
    questions: [
      {
        question: "Why can a permission be enabled but the user still cannot perform the action?",
        answer:
          "Global permission keys are necessary but not always sufficient. Project hard rules still check ownership, executor assignment, membership, and sensitive workflow ownership.",
      },
      {
        question: "When should I use Sync Definitions?",
        answer:
          "Use it after new permission keys are added in code or after a deployment where the Manage Permissions modal does not show the expected key.",
      },
    ],
  },
  {
    id: "library-archives",
    eyebrow: "Files & Traceability",
    title: "Library & Archives",
    summary:
      "Library stores active working files. Archives stores final completed files and completion documents after project closeout. Favorites are personal to each user.",
    keywords: ["library", "archives", "favorites", "files", "preview", "download", "delete"],
    blocks: [
      {
        title: "What belongs in each area",
        items: [
          "Library includes project brief attachments, stage brief attachments, chat attachments, project assets, submissions, and other non-archived working files.",
          "Archives contains final completed files plus completion records such as approval proof, copyright transfer documents, and invoices.",
          "Favorites are personal bookmarks. If one user favorites a file, that favorite does not apply to everyone else.",
        ],
      },
      {
        title: "Typical file actions",
        items: [
          "Preview common formats like images or PDFs when supported; otherwise download the file.",
          "Use Library filters such as search, project, date, creator, type, tag, and favorites where available.",
          "Delete should require confirmation and remain limited to allowed users such as the project owner or super admin.",
        ],
      },
      {
        title: "How files stay traceable",
        items: [
          "Project brief attachments tie back to the overall project setup context.",
          "Stage brief attachments tie back to the stage where that instruction applies.",
          "Chat attachments stay associated with the stage discussion where they were shared.",
          "Submissions remain linked to the revision history they belong to.",
          "Archived files preserve the final handover record after completion.",
        ],
      },
    ],
    questions: [
      {
        question: "Why is a file missing from Archives?",
        answer:
          "Only final completed and archived files should appear in Archives. Working files remain in Library until the project reaches final completion and archive.",
      },
    ],
  },
  {
    id: "calendar",
    eyebrow: "Schedules",
    title: "Calendar",
    summary:
      "Calendar organizes schedules across Month, Week, and Day views. It supports events, project dates, reminders, payments, collaborator assignment, and access-based visibility.",
    keywords: ["calendar", "month view", "filters", "reminders", "payments", "calendar collaborators"],
    blocks: [
      {
        title: "Views and filters",
        items: [
          "Month is the default view when the page opens fresh.",
          "Week and Day views remain available for narrower scheduling detail.",
          "My Calendar filters let users include or exclude Projects, Events, Reminders, and Payments from the visible list.",
        ],
      },
      {
        title: "Collaborator visibility",
        items: [
          "Calendar collaborators can be added or removed from the schedule access list.",
          "A removed collaborator should no longer see shared schedule items they no longer have access to.",
          "Calendar visibility is filtered by the current user’s allowed access, not only by what the UI happens to show.",
        ],
      },
      {
        title: "How to use the page effectively",
        items: [
          "Use the mini calendar and upcoming schedule list to jump between time ranges quickly.",
          "Use filters when you want to focus on one type of schedule item at a time.",
          "Treat shared calendar access separately from project collaboration when checking visibility issues.",
        ],
      },
    ],
  },
  {
    id: "notifications-mentions",
    eyebrow: "Activity Updates",
    title: "Notifications & mentions",
    summary:
      "Notifications are database-backed workflow updates that refresh through polling. Mentions in stage chat notify the right participants without requiring a manual page refresh.",
    keywords: ["notifications", "mentions", "polling", "unread", "bell", "workflow notifications"],
    blocks: [
      {
        title: "Where notifications appear",
        items: [
          "The bell dropdown shows recent notifications and an unread count.",
          "The full Notifications page supports search, filters, unread/read states, and deeper review.",
          "Notifications cover project assignment, brief accepted, work submitted, revision requested, completion, archive events, and completion-document uploads.",
        ],
      },
      {
        title: "Mentions and delivery",
        items: [
          "Typing @ in stage chat should suggest allowed project participants.",
          "@mentions create direct notifications for the mentioned users.",
          "The product uses polling, around every 30 seconds, rather than Socket.IO for notification refresh.",
        ],
      },
      {
        title: "What to do when an update seems missing",
        items: [
          "Wait a short time for the next polling cycle.",
          "Check whether the notification belongs to your role or project membership.",
          "Open the full notifications page if the dropdown is too narrow for older items.",
        ],
      },
    ],
  },
  {
    id: "settings-users-master-data",
    eyebrow: "Administration",
    title: "Settings, Users & master data",
    summary:
      "Settings covers personal profile and password changes, while administrative setup lives in project master data, the Users page, and Manage Permissions.",
    keywords: ["settings", "users", "master data", "categories", "tags", "currencies", "change password"],
    blocks: [
      {
        title: "What Settings manages",
        items: [
          "Profile details such as your name, department, phone number, job title, bio, and avatar.",
          "Password changes with simple validation and current-password verification.",
          "Project Master Data such as categories, tags, and currencies used across project forms.",
        ],
      },
      {
        title: "Users and permission profiles",
        items: [
          "The Users page is for user directory management and is intended for super-admin oversight.",
          "Manage Permissions defines global capabilities by role and collaborator type rather than by editing every user one by one.",
          "Use permission profiles to scale safely when many collaborators need consistent access patterns.",
        ],
      },
      {
        title: "Helpful working rules",
        items: [
          "If a category or tag is missing, add it through quick-add in the project form or through Project Master Data.",
          "Keep profile-based permissions clean so the same type of user behaves consistently across the product.",
          "Treat permission keys as product rules rather than exposing implementation details to end users.",
        ],
      },
    ],
  },
  {
    id: "project-completion",
    eyebrow: "Closeout",
    title: "Project completion & archive",
    summary:
      "Final completion closes the last stage, moves final files to Archives, locks the chat from further edits, and opens the post-completion checklist.",
    keywords: ["project completion", "archive", "authority approval", "copyright", "invoice"],
    blocks: [
      {
        title: "What happens at final completion",
        ordered: true,
        items: [
          "The project owner accepts the final stage submission.",
          "The completion flow opens and final files can be renamed before archive if needed.",
          "Final files move into Archives with the right project metadata.",
          "The chat becomes locked for further interaction while remaining viewable for reference.",
        ],
      },
      {
        title: "Post-completion checklist",
        items: [
          "Authority Approval can be marked required or not required. If required, proof is uploaded later.",
          "Copyright Transfer can be required or not required. If required, the signed document is uploaded later.",
          "Invoice steps open after the approval and copyright prerequisites are satisfied or marked not required.",
        ],
      },
      {
        title: "Current product notes",
        items: [
          "Completion documents remain archived separately from normal working files.",
          "The owner and executor are the main actors in the post-completion checklist.",
          "External email or notification sending for these later completion steps is designed as a later phase rather than a guarantee of the current build.",
        ],
      },
    ],
  },
  {
    id: "troubleshooting",
    eyebrow: "Common Issues",
    title: "Troubleshooting",
    summary:
      "Most issues come from role, membership, or field-level permissions. Use these checks first before assuming a project, file, or workflow record is missing.",
    keywords: ["troubleshooting", "cannot see project", "access denied", "upload slow", "missing notification"],
    blocks: [
      {
        title: "Check access first",
        items: [
          "If you cannot see a project, confirm you are the owner, executor, or an assigned collaborator.",
          "If you cannot see the budget, remember budget visibility follows stricter business rules than general project access.",
          "If the Submit Work button is missing, confirm you are the assigned executor and that the brief has been accepted.",
          "If a calendar item is missing, confirm your calendar collaborator access or creator access.",
        ],
      },
      {
        title: "File and notification checks",
        items: [
          "If an upload feels slow, look for progress feedback and allow for storage latency rather than re-uploading immediately.",
          "If a file is missing from Library or Archives, check whether it is a working file, a final archived file, or a completion document.",
          "If a notification does not appear instantly, wait for the next polling cycle and then recheck the bell or Notifications page.",
        ],
      },
    ],
    questions: [
      {
        question: "Why can’t I see a project even though someone mentioned it?",
        answer:
          "Project visibility depends on project membership and permission profiles. Ask an admin or project owner to confirm you were added correctly.",
      },
      {
        question: "Why can’t I upload or delete a file?",
        answer:
          "Uploads and deletes are permission-sensitive. Confirm you are acting in the right module and that your role allows that action for the current project or file type.",
      },
      {
        question: "Why is a master data option missing from a dropdown?",
        answer:
          "The category, tag, or currency may not exist yet. Use quick-add from the project form or create it in Project Master Data if you have access.",
      },
    ],
  },
];

export const helpManagementHighlights = [
  "Projects and work organized in one place",
  "Stages, budgets, and key milestones",
  "Team collaboration and permission profiles",
  "Working files in Library and final files in Archives",
  "Calendar schedules, reminders, and deadlines",
  "Notifications, mentions, and activity updates",
  "Completion checklist and archived handover documents",
];

export const helpCoreWorkflow = [
  "Create the project and define the stages.",
  "Assign the executor and invite collaborators.",
  "Accept the brief and start the timer.",
  "Discuss work, upload files, and submit revisions.",
  "Review, revise, complete, and archive the project.",
];

export const helpKeyTerms = [
  {
    term: "Project Brief",
    description: "The main project-level requirement that applies across the full project.",
  },
  {
    term: "Stage Brief",
    description: "The stage-specific instruction for what needs to be done in the current stage.",
  },
  {
    term: "Project Owner",
    description: "The user who creates or owns the project and reviews submissions.",
  },
  {
    term: "Project Executor",
    description: "The person or company that accepts the brief, starts work, and submits revisions.",
  },
  {
    term: "Attachment",
    description: "A reference or discussion file uploaded during project or stage collaboration.",
  },
  {
    term: "Submission",
    description: "Formal work output from the executor that requires owner review.",
  },
  {
    term: "Library",
    description: "Working, non-archived files across active projects.",
  },
  {
    term: "Archives",
    description: "Final completed files and completion documents after project closeout.",
  },
];

export const helpSearchKeywords = [
  "create project",
  "project brief",
  "stage brief",
  "accept brief",
  "submit work",
  "request revision",
  "archive project",
  "library vs archives",
  "notifications",
  "mentions",
  "calendar filters",
  "manage permissions",
  "troubleshooting access denied",
];
