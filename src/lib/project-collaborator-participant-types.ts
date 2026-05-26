export const projectCollaboratorParticipantTypes = [
  "GTI_INTERNAL_CLIENT",
  "GTI_SISTER_COMPANY_INTERNAL_CLIENT",
  "EXTERNAL_FREELANCER",
  "EXTERNAL_AGENCY",
  "EXTERNAL_VENDOR",
  "CLIENT_OF_GTI",
] as const;

export type ProjectCollaboratorParticipantType =
  (typeof projectCollaboratorParticipantTypes)[number];

type CollaboratorGroup = "internal" | "external";

type CollaboratorTypeMeta = {
  label: string;
  group: CollaboratorGroup;
  badgeClassName: string;
  dotClassName: string;
};

const neutralTypeMeta: CollaboratorTypeMeta = {
  label: "Unassigned Type",
  group: "external",
  badgeClassName: "border border-[#e2e5e2] bg-[#f5f6f5] text-[#6a726d]",
  dotClassName: "bg-[#a1aaa4]",
};

const collaboratorTypeMetaMap: Record<
  ProjectCollaboratorParticipantType,
  CollaboratorTypeMeta
> = {
  GTI_INTERNAL_CLIENT: {
    label: "GTI Internal Client",
    group: "internal",
    badgeClassName: "border border-[#f0d5d4] bg-[#fff1f0] text-[#c35a54]",
    dotClassName: "bg-[#d56a63]",
  },
  GTI_SISTER_COMPANY_INTERNAL_CLIENT: {
    label: "GTI Sister Company Internal Client",
    group: "internal",
    badgeClassName: "border border-[#f3dfcf] bg-[#fff5ea] text-[#cf8351]",
    dotClassName: "bg-[#e09b61]",
  },
  EXTERNAL_FREELANCER: {
    label: "External Freelancer",
    group: "external",
    badgeClassName: "border border-[#f4e6c8] bg-[#fff9eb] text-[#bf8d2e]",
    dotClassName: "bg-[#d2ac4d]",
  },
  EXTERNAL_AGENCY: {
    label: "External Agency",
    group: "external",
    badgeClassName: "border border-[#d9e8f8] bg-[#eef6ff] text-[#4a7cb9]",
    dotClassName: "bg-[#5b90cf]",
  },
  EXTERNAL_VENDOR: {
    label: "External Vendor",
    group: "external",
    badgeClassName: "border border-[#e5dcf7] bg-[#f5f0ff] text-[#7a62c7]",
    dotClassName: "bg-[#8b73db]",
  },
  CLIENT_OF_GTI: {
    label: "Client of GTI",
    group: "external",
    badgeClassName: "border border-[#d6ead8] bg-[#eef8ef] text-[#3f8b5f]",
    dotClassName: "bg-[#5fa67c]",
  },
};

export function isProjectCollaboratorParticipantType(
  value: string,
): value is ProjectCollaboratorParticipantType {
  return projectCollaboratorParticipantTypes.includes(
    value as ProjectCollaboratorParticipantType,
  );
}

export function getProjectCollaboratorTypeMeta(
  type: ProjectCollaboratorParticipantType | null | undefined,
) {
  if (!type) {
    return neutralTypeMeta;
  }

  return collaboratorTypeMetaMap[type];
}

export function getDefaultProjectCollaboratorParticipantType(
  group: CollaboratorGroup,
): ProjectCollaboratorParticipantType {
  return group === "internal" ? "GTI_INTERNAL_CLIENT" : "EXTERNAL_FREELANCER";
}
