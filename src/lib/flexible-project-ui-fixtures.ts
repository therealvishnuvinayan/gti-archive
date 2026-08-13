// UI PROTOTYPE ONLY — REMOVE WHEN FLEXIBLE PROJECT BACKEND IS IMPLEMENTED.
// These fixtures must never be imported by project services, dashboard counts,
// calendar queries, notifications, or the fixed Stage 1–7 workflow.

export type FlexibleMilestoneVisualState =
  | "completed"
  | "current"
  | "upcoming"
  | "attention";

export type FlexibleMilestoneFixture = {
  id: string;
  order: number;
  category: string;
  name: string;
  statusLabel: string;
  dateLabel: string;
  visualState: FlexibleMilestoneVisualState;
  responsible: string;
  approvalRequired: boolean;
  description: string;
};

export type FlexibleProjectFixture = {
  id: string;
  slug: string;
  type: string;
  status: "Active";
  name: string;
  description: string;
  progress: number;
  completedMilestones: number;
  totalMilestones: number;
  owner: {
    id: string;
    name: string;
  };
  deadline: string;
  priority: "High" | "Medium" | "Low";
  scope: "Internal" | "External";
  milestones: FlexibleMilestoneFixture[];
};

export type FlexibleBlockCategory =
  | "Basic"
  | "Workflow"
  | "Creative"
  | "Vendor & Purchase"
  | "Review & Inspection"
  | "Event"
  | "Website / App"
  | "Marketing"
  | "Advanced";

export type FlexibleBlockDefinition = {
  name: string;
  category: FlexibleBlockCategory;
};

const exhibitionMilestones: FlexibleMilestoneFixture[] = [
  {
    id: "event-brief",
    order: 1,
    category: "Standard",
    name: "Event Brief",
    statusLabel: "Completed",
    dateLabel: "10 Oct 2026",
    visualState: "completed",
    responsible: "Sarah Ahmed",
    approvalRequired: false,
    description: "Align the exhibition goals, audience, deliverables, and working budget.",
  },
  {
    id: "vendor-sourcing",
    order: 2,
    category: "Vendor Sourcing",
    name: "Identify Stand Vendors",
    statusLabel: "Completed",
    dateLabel: "22 Oct 2026",
    visualState: "completed",
    responsible: "Vishnu",
    approvalRequired: false,
    description: "Build and review a shortlist of suitable exhibition stand vendors.",
  },
  {
    id: "quotation-selection",
    order: 3,
    category: "Vendor Comparison",
    name: "Quotation & Selection",
    statusLabel: "Completed",
    dateLabel: "02 Nov 2026",
    visualState: "completed",
    responsible: "Sarah Ahmed",
    approvalRequired: true,
    description: "Compare commercial proposals and confirm the preferred partner.",
  },
  {
    id: "stand-design-review",
    order: 4,
    category: "Design Review",
    name: "Stand Design Review",
    statusLabel: "Awaiting Approval",
    dateLabel: "18 Nov 2026",
    visualState: "current",
    responsible: "Vishnu",
    approvalRequired: true,
    description: "Review shortlisted stand concepts, materials, and visitor flow.",
  },
  {
    id: "material-inspection",
    order: 5,
    category: "Sample Review",
    name: "Material Inspection",
    statusLabel: "Upcoming",
    dateLabel: "30 Nov 2026",
    visualState: "upcoming",
    responsible: "Vishnu",
    approvalRequired: false,
    description: "Inspect physical material samples before production begins.",
  },
  {
    id: "installation",
    order: 6,
    category: "Event / Exhibition",
    name: "Installation",
    statusLabel: "Upcoming",
    dateLabel: "08 Feb 2027",
    visualState: "attention",
    responsible: "Sarah Ahmed",
    approvalRequired: false,
    description: "Coordinate delivery, installation, snagging, and venue readiness.",
  },
  {
    id: "event-closeout",
    order: 7,
    category: "Handover",
    name: "Event Closeout",
    statusLabel: "Upcoming",
    dateLabel: "15 Feb 2027",
    visualState: "upcoming",
    responsible: "Sarah Ahmed",
    approvalRequired: true,
    description: "Complete final handover, documentation, and event closeout.",
  },
];

const websiteMilestones: FlexibleMilestoneFixture[] = [
  ["discovery", "Discovery", "Website Brief", "Completed", "05 Sep 2026", "completed"],
  ["sitemap", "UX Planning", "Sitemap & User Journeys", "Completed", "19 Sep 2026", "completed"],
  ["template-selection", "Creative", "Template Selection", "In Progress", "22 Oct 2026", "current"],
  ["design-system", "Design", "UI Design System", "Upcoming", "10 Nov 2026", "upcoming"],
  ["development", "Website / App", "Website Development", "Upcoming", "12 Dec 2026", "upcoming"],
  ["qa", "Review & Inspection", "QA & Content Review", "Upcoming", "20 Dec 2026", "upcoming"],
  ["launch", "Website / App", "Production Launch", "Upcoming", "05 Jan 2027", "upcoming"],
].map(([id, category, name, statusLabel, dateLabel, visualState], index) => ({
  id,
  order: index + 1,
  category,
  name,
  statusLabel,
  dateLabel,
  visualState: visualState as FlexibleMilestoneVisualState,
  responsible: index === 2 ? "Vishnu" : "Admin User",
  approvalRequired: index === 2 || index === 6,
  description: `Coordinate the ${name.toLowerCase()} work and capture the agreed outcome.`,
}));

const videoMilestones: FlexibleMilestoneFixture[] = [
  ["video-brief", "Standard", "Campaign Film Brief", "Completed", "12 Aug 2026", "completed"],
  ["storyboard", "Creative", "Script & Storyboard", "Completed", "28 Aug 2026", "completed"],
  ["production", "Creative", "Production", "Completed", "18 Sep 2026", "completed"],
  ["rough-cut", "Review", "Rough Cut Review", "In Progress", "02 Oct 2026", "current"],
  ["master-delivery", "Handover", "Master Delivery", "Upcoming", "16 Oct 2026", "upcoming"],
].map(([id, category, name, statusLabel, dateLabel, visualState], index) => ({
  id,
  order: index + 1,
  category,
  name,
  statusLabel,
  dateLabel,
  visualState: visualState as FlexibleMilestoneVisualState,
  responsible: "Collaborator 01",
  approvalRequired: index >= 3,
  description: `Manage the ${name.toLowerCase()} activities and review materials.`,
}));

export const FLEXIBLE_PROJECT_FIXTURES: FlexibleProjectFixture[] = [
  {
    id: "flex-demo-exhibition",
    slug: "demo-exhibition",
    type: "Event",
    status: "Active",
    name: "Dubai Retail Exhibition 2027",
    description:
      "Prepare the exhibition concept, source vendors, review the stand design, manage production, installation, delivery and final handover.",
    progress: 43,
    completedMilestones: 3,
    totalMilestones: 7,
    owner: { id: "sarah-ahmed", name: "Sarah Ahmed" },
    deadline: "15 Feb 2027",
    priority: "High",
    scope: "External",
    milestones: exhibitionMilestones,
  },
  {
    id: "flex-demo-website",
    slug: "demo-website-redesign",
    type: "Website",
    status: "Active",
    name: "Website Redesign",
    description:
      "Refresh the corporate website experience, content architecture, visual system, and launch plan.",
    progress: 28,
    completedMilestones: 2,
    totalMilestones: 7,
    owner: { id: "admin-user", name: "Admin User" },
    deadline: "05 Jan 2027",
    priority: "Medium",
    scope: "Internal",
    milestones: websiteMilestones,
  },
  {
    id: "flex-demo-video",
    slug: "demo-brand-launch-video",
    type: "Video",
    status: "Active",
    name: "Brand Launch Video",
    description:
      "Develop a launch film from creative brief and storyboard through production, review, and master delivery.",
    progress: 60,
    completedMilestones: 3,
    totalMilestones: 5,
    owner: { id: "collaborator-01", name: "Collaborator 01" },
    deadline: "16 Oct 2026",
    priority: "High",
    scope: "External",
    milestones: videoMilestones,
  },
];

export function getFlexibleProjectFixture(slug: string) {
  return FLEXIBLE_PROJECT_FIXTURES.find((project) => project.slug === slug) ?? null;
}

export function getFlexibleMilestoneFixture(projectSlug: string, milestoneId: string) {
  const project = getFlexibleProjectFixture(projectSlug);
  const milestone = project?.milestones.find((item) => item.id === milestoneId) ?? null;

  return project && milestone ? { project, milestone } : null;
}

const blockGroups: Record<FlexibleBlockCategory, string[]> = {
  Basic: ["Text", "Long Text", "Number", "Date", "URL", "File", "Image", "Video", "Checklist", "Note"],
  Workflow: ["Submission", "Approval", "Request Information", "Request File", "Review", "Revision Request", "Sign-off"],
  Creative: ["Concept Submission", "Artwork Submission", "File Comparison", "Design Review", "Creative Approval"],
  "Vendor & Purchase": ["Vendor List", "Vendor Search", "Quotation", "Quotation Comparison", "Purchase Request", "Invoice"],
  "Review & Inspection": ["Sample Request", "Sample Review", "Quality Inspection", "Photo Evidence"],
  Event: ["Event Brief", "Venue", "Contractor", "Installation", "Event Checklist"],
  "Website / App": ["Staging URL", "Production URL", "Figma URL", "Repository URL", "Deployment", "QA Checklist", "Bug List"],
  Marketing: ["Campaign Brief", "Target Audience", "Content", "Launch Date", "Campaign Approval"],
  Advanced: ["Custom Input", "Custom Form", "Custom Checklist", "Custom Table"],
};

export const FLEXIBLE_BLOCK_CATEGORIES = Object.keys(blockGroups) as FlexibleBlockCategory[];

export const FLEXIBLE_BLOCK_DEFINITIONS: FlexibleBlockDefinition[] =
  FLEXIBLE_BLOCK_CATEGORIES.flatMap((category) =>
    blockGroups[category].map((name) => ({ name, category })),
  );

export const FLEXIBLE_MILESTONE_ACTIVITY_FIXTURES = [
  { id: "activity-1", time: "10:35", text: "Vishnu uploaded Theme 2" },
  { id: "activity-2", time: "11:42", text: "Sarah requested a revision" },
  { id: "activity-3", time: "12:10", text: "Vishnu added a note" },
  { id: "activity-4", time: "14:20", text: "Template 2 approved" },
];
