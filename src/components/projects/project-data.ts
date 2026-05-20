export type ProjectStageStatus = "completed" | "in-progress" | "due";

export type ProjectStage = {
  id: string;
  label: string;
  subtitle: string;
  title: string;
  createdOn: string;
  budget: string;
  status: ProjectStageStatus;
};

export type ProjectCollaborator = {
  id: string;
  name: string;
  role: string;
  group: "internal" | "external";
  access: "owner" | "view";
  removable?: boolean;
};

export type ProjectChatEntry = {
  id: string;
  kind: "revision" | "comment";
  title?: string;
  author: string;
  role: string;
  body: string;
  briefLabel?: string;
  attachments?: string[];
  compareLabel?: string;
};

export type ProjectStageOverview = {
  budget: string;
  revisions: number;
  stageStarted: string;
  stageDeadline: string;
  briefLabel: string;
};

export type ProjectRecord = {
  slug: string;
  stage: string;
  category: string;
  title: string;
  createdOn: string;
  createdBy: string;
  featured?: boolean;
  emphasized?: boolean;
  owner: string;
  statusLabel: string;
  budget: string;
  stages: number;
  startDate: string;
  deadline: string;
  tag: string;
  priority: string;
  stageCards: ProjectStage[];
  collaborators: ProjectCollaborator[];
  stageOverview?: ProjectStageOverview;
  chatEntries?: ProjectChatEntry[];
};

export const projectRecords: ProjectRecord[] = [
  {
    slug: "milano-project-1-packaging-design",
    stage: "Stage 2 : In Progress",
    category: "Packaging Design",
    title: "Milano Project 1 Packaging Design",
    createdOn: "17/08/2025",
    createdBy: "Slavomir Kluziak",
    featured: true,
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "9000 USD",
    stages: 4,
    startDate: "17/08/2023",
    deadline: "17/10/2023",
    tag: "Artwork",
    priority: "Medium",
    stageCards: [
      {
        id: "stage-1",
        label: "Stage 1 : Completed",
        subtitle: "Packaging Design",
        title: "Milano Project 1 Packaging Design",
        createdOn: "17/08/2025",
        budget: "3000 USD",
        status: "completed",
      },
      {
        id: "stage-2",
        label: "Stage 2 : In Progress",
        subtitle: "Packaging Design",
        title: "Milano Project 1 Packaging Design",
        createdOn: "17/08/2025",
        budget: "3000 USD",
        status: "in-progress",
      },
      {
        id: "stage-3",
        label: "Stage 2 : Due",
        subtitle: "Packaging Design",
        title: "Milano Project 1 Packaging Design",
        createdOn: "17/09/2025",
        budget: "3000 USD",
        status: "due",
      },
    ],
    collaborators: [
      { id: "c-1", name: "Slavomir Kluziak", role: "Project Owner", group: "internal", access: "owner" },
      { id: "c-2", name: "User 1", role: "Collaborator", group: "internal", access: "owner", removable: true },
      { id: "c-3", name: "User 2", role: "Collaborator", group: "internal", access: "owner", removable: true },
      { id: "c-4", name: "User 3", role: "Collaborator", group: "internal", access: "owner", removable: true },
      { id: "c-5", name: "User 4", role: "Collaborator", group: "internal", access: "owner", removable: true },
      { id: "c-6", name: "User 5", role: "Collaborator", group: "internal", access: "owner", removable: true },
      { id: "c-7", name: "User 6", role: "Collaborator", group: "internal", access: "owner", removable: true },
      { id: "c-8", name: "User 7", role: "Collaborator", group: "internal", access: "owner", removable: true },
      { id: "c-9", name: "Sam", role: "Designer", group: "external", access: "view" },
      { id: "c-10", name: "Harry", role: "Designer", group: "external", access: "view" },
      { id: "c-11", name: "Mclean", role: "Print House", group: "external", access: "owner" },
    ],
    stageOverview: {
      budget: "3000 USD (30%)",
      revisions: 3,
      stageStarted: "25/08/2023",
      stageDeadline: "28/08/2023",
      briefLabel: "Brief",
    },
    chatEntries: [
      {
        id: "chat-1",
        kind: "revision",
        title: "Revision 3",
        author: "F",
        role: "Designer",
        body: "Dear team, please find the revised artworks according to the latest brief",
        briefLabel: "latest brief",
        attachments: ["AI", "PSD", "PDF", "FIG", "ZIP"],
        compareLabel: "Compare with other stages",
      },
      {
        id: "chat-2",
        kind: "comment",
        author: "S",
        role: "Project Owner",
        body: "Please correct the yellow color of the ice mango to more vibrant version, Please find the Attached color references",
        attachments: ["FIG", "LINK"],
      },
      {
        id: "chat-3",
        kind: "comment",
        author: "W",
        role: "Collaborator",
        body: "The yellow color needs change",
      },
      {
        id: "chat-4",
        kind: "comment",
        author: "A",
        role: "Collaborator",
        body: "The colors are not right!",
      },
      {
        id: "chat-5",
        kind: "revision",
        title: "Revision 3",
        author: "F",
        role: "Designer",
        body: "Dear team, please find the revised artworks according to the latest brief",
        briefLabel: "latest brief",
        attachments: ["AI", "PSD", "PDF", "FIG", "ZIP"],
        compareLabel: "Compare with other stages",
      },
    ],
  },
  {
    slug: "milano-project-2-variance",
    stage: "Stage 2 : In Progress",
    category: "Packaging Design",
    title: "Milano Project 2 Variance",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "7600 USD",
    stages: 3,
    startDate: "16/03/2023",
    deadline: "26/04/2023",
    tag: "Variance",
    priority: "High",
    stageCards: [],
    collaborators: [],
  },
  {
    slug: "milano-project-3-king-size",
    stage: "Stage 2 : In Progress",
    category: "Packaging Design - Outer",
    title: "Milano Project 3 King Size",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "7200 USD",
    stages: 3,
    startDate: "16/03/2023",
    deadline: "22/04/2023",
    tag: "Outer",
    priority: "Medium",
    stageCards: [],
    collaborators: [],
  },
  {
    slug: "milano-project-4-flavours",
    stage: "Stage 2 : In Progress",
    category: "Leaflet Design",
    title: "Milano Project 4 Flavours",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    emphasized: true,
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "6800 USD",
    stages: 3,
    startDate: "16/03/2023",
    deadline: "30/04/2023",
    tag: "Leaflet",
    priority: "Medium",
    stageCards: [],
    collaborators: [],
  },
  {
    slug: "milano-project-4-poster",
    stage: "Stage 2 : In Progress",
    category: "Marketing Graphics Design",
    title: "Milano Project 4 Poster",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "5200 USD",
    stages: 2,
    startDate: "16/03/2023",
    deadline: "24/04/2023",
    tag: "Poster",
    priority: "Low",
    stageCards: [],
    collaborators: [],
  },
  {
    slug: "mond-project-1-fanpack",
    stage: "Stage 2 : In Progress",
    category: "Packaging Design",
    title: "Mond Project 1 Fanpack",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "8100 USD",
    stages: 4,
    startDate: "16/03/2023",
    deadline: "18/05/2023",
    tag: "Fanpack",
    priority: "Medium",
    stageCards: [],
    collaborators: [],
  },
  {
    slug: "gulbahar-branding",
    stage: "Stage 2 : In Progress",
    category: "Branding Design",
    title: "Gulbahar Branding",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "12000 USD",
    stages: 5,
    startDate: "16/03/2023",
    deadline: "08/06/2023",
    tag: "Branding",
    priority: "High",
    stageCards: [],
    collaborators: [],
  },
  {
    slug: "milano-project-4-king-size",
    stage: "Stage 2 : In Progress",
    category: "POS Header Design",
    title: "Milano Project 4 King Size",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "6100 USD",
    stages: 3,
    startDate: "16/03/2023",
    deadline: "29/04/2023",
    tag: "POS",
    priority: "Medium",
    stageCards: [],
    collaborators: [],
  },
  {
    slug: "momento-project-1",
    stage: "Stage 2 : In Progress",
    category: "Packaging Design - Outer",
    title: "Momento Project 1",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    owner: "S",
    statusLabel: "Stage 2 in progress",
    budget: "5900 USD",
    stages: 3,
    startDate: "16/03/2023",
    deadline: "01/05/2023",
    tag: "Outer",
    priority: "Low",
    stageCards: [],
    collaborators: [],
  },
];

export function getProjectBySlug(slug: string) {
  return projectRecords.find((project) => project.slug === slug);
}
