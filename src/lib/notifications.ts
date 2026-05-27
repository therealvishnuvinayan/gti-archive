export type NotificationType =
  | "Project"
  | "Revision"
  | "Archive"
  | "Invoice"
  | "Approval"
  | "Comment";

export type NotificationVisualKind =
  | "project-completed"
  | "revision-approved"
  | "revision-submitted"
  | "revision-rejected"
  | "invoice-uploaded"
  | "approval-received"
  | "comment"
  | "project-assigned"
  | "stage-completed"
  | "archive-created"
  | "copyright-transfer"
  | "submission-pending";

export type NotificationContextTone =
  | "project"
  | "revision"
  | "content"
  | "design"
  | "review"
  | "archive"
  | "approval"
  | "invoice"
  | "comment";

export type NotificationRecord = {
  id: string;
  title: string;
  description: string;
  timestampLabel: string;
  sortOrder: number;
  type: NotificationType;
  contextLabel: string;
  contextTone: NotificationContextTone;
  read: boolean;
  mention: boolean;
  system: boolean;
  visualKind: NotificationVisualKind;
  actorName?: string;
  actorInitials?: string;
  actorTone?: "sunset" | "mint" | "violet";
  targetHref: string;
};

export const dummyNotifications: NotificationRecord[] = [
  {
    id: "notif-project-completed-cavallo",
    title: "Project completed: Cavallo new package",
    description: "The project has been completed successfully.",
    timestampLabel: "2 min ago",
    sortOrder: 1200,
    type: "Project",
    contextLabel: "Project",
    contextTone: "project",
    read: false,
    mention: false,
    system: false,
    visualKind: "project-completed",
    targetHref: "/projects",
  },
  {
    id: "notif-revision-approved-stage-1",
    title: "Revision approved for Stage 1",
    description: "Stage 1 revision has been approved.",
    timestampLabel: "1 hour ago",
    sortOrder: 1190,
    type: "Revision",
    contextLabel: "Stage 1",
    contextTone: "revision",
    read: false,
    mention: false,
    system: false,
    visualKind: "revision-approved",
    targetHref: "/projects",
  },
  {
    id: "notif-invoice-uploaded-milano",
    title: "Invoice uploaded for Milano Queens",
    description: "Invoice #INV-2026-042 has been uploaded.",
    timestampLabel: "2 hours ago",
    sortOrder: 1180,
    type: "Invoice",
    contextLabel: "Invoices",
    contextTone: "invoice",
    read: false,
    mention: false,
    system: false,
    visualKind: "invoice-uploaded",
    targetHref: "/projects",
  },
  {
    id: "notif-approval-document-received",
    title: "Approval document received",
    description: "Approval document has been received and logged.",
    timestampLabel: "Today, 10:15 am",
    sortOrder: 1170,
    type: "Approval",
    contextLabel: "Legal Review",
    contextTone: "approval",
    read: false,
    mention: false,
    system: false,
    visualKind: "approval-received",
    targetHref: "/projects",
  },
  {
    id: "notif-comment-vishnu",
    title: "New comment from Vishnu",
    description: "Please review the latest comment on Stage 2.",
    timestampLabel: "Today, 09:12 am",
    sortOrder: 1160,
    type: "Comment",
    contextLabel: "Mentions",
    contextTone: "comment",
    read: false,
    mention: true,
    system: false,
    visualKind: "comment",
    actorName: "Vishnu",
    actorInitials: "VI",
    actorTone: "violet",
    targetHref: "/projects",
  },
  {
    id: "notif-project-assigned",
    title: "Project assigned to executor",
    description: "New project “Marketing Assets Archive” has been assigned to you.",
    timestampLabel: "Today, 08:41 am",
    sortOrder: 1150,
    type: "Project",
    contextLabel: "Project",
    contextTone: "project",
    read: false,
    mention: false,
    system: true,
    visualKind: "project-assigned",
    actorName: "GTI Archive",
    actorInitials: "GT",
    actorTone: "sunset",
    targetHref: "/projects",
  },
  {
    id: "notif-revision-submitted",
    title: "Revision submitted",
    description:
      "Revision 2 for stage “Research & Planning” has been submitted for review.",
    timestampLabel: "Today, 09:43 am",
    sortOrder: 1140,
    type: "Revision",
    contextLabel: "Research & Planning",
    contextTone: "revision",
    read: true,
    mention: false,
    system: false,
    visualKind: "revision-submitted",
    targetHref: "/projects",
  },
  {
    id: "notif-revision-rejected",
    title: "Revision rejected",
    description:
      "Revision 1 for stage “Design & Layout” has been rejected. Please review comments.",
    timestampLabel: "Yesterday, 02:18 pm",
    sortOrder: 1130,
    type: "Revision",
    contextLabel: "Design & Layout",
    contextTone: "design",
    read: true,
    mention: false,
    system: false,
    visualKind: "revision-rejected",
    actorName: "GTI Archive Admin2",
    actorInitials: "GA",
    actorTone: "sunset",
    targetHref: "/projects",
  },
  {
    id: "notif-stage-completed",
    title: "Stage completed",
    description: "Stage “Final Review” has been marked as completed.",
    timestampLabel: "27 May 2026, 05:21 pm",
    sortOrder: 1120,
    type: "Project",
    contextLabel: "Final Review",
    contextTone: "review",
    read: true,
    mention: false,
    system: false,
    visualKind: "stage-completed",
    targetHref: "/projects",
  },
  {
    id: "notif-archive-created",
    title: "Archive created",
    description: "Archive “Brand Guidelines 2026” has been created successfully.",
    timestampLabel: "27 May 2026, 03:11 pm",
    sortOrder: 1110,
    type: "Archive",
    contextLabel: "Archive",
    contextTone: "archive",
    read: true,
    mention: false,
    system: true,
    visualKind: "archive-created",
    targetHref: "/archives",
  },
  {
    id: "notif-copyright-transfer",
    title: "Copyright transfer received",
    description: "Signed copyright transfer has been uploaded for the final package.",
    timestampLabel: "26 May 2026, 11:47 am",
    sortOrder: 1100,
    type: "Approval",
    contextLabel: "Rights Transfer",
    contextTone: "approval",
    read: true,
    mention: false,
    system: false,
    visualKind: "copyright-transfer",
    targetHref: "/projects",
  },
  {
    id: "notif-submission-pending-review",
    title: "Submission pending review",
    description: "A final submission is waiting for owner review in Packaging Review.",
    timestampLabel: "26 May 2026, 09:37 am",
    sortOrder: 1090,
    type: "Revision",
    contextLabel: "Packaging Review",
    contextTone: "review",
    read: true,
    mention: false,
    system: true,
    visualKind: "submission-pending",
    targetHref: "/projects",
  },
];

export const notificationTypeOptions = [
  "All Types",
  "Project",
  "Revision",
  "Archive",
  "Invoice",
  "Approval",
  "Comment",
] as const;

export type NotificationTypeFilter = (typeof notificationTypeOptions)[number];

export const notificationTabs = [
  "All",
  "Unread",
  "Read",
  "Mentions",
  "System",
] as const;

export type NotificationTabFilter = (typeof notificationTabs)[number];
