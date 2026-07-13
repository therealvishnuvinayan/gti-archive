export type ArchiveArtworkMetadataDraft = {
  artworkId: string;
  titleWorkingName: string;
  versionRevision: string;
  languageMarket: string;
  artworkType: string;
  brandSubBrand: string;
  productSku: string;
  campaignProject: string;
  formatDimensions: string;
  colourSpace: string;
  resolution: string;
  fileFormats: string;
  printProcess: string;
  specialFinishes: string;
  creationDate: string;
  lastModifiedDate: string;
  goLiveOnShelfDate: string;
  expirySunsetDate: string;
  archiveStatus: string;
  createdByName: string;
  approvedByName: string;
  approvedAt: string;
  clientBrandOwner: string;
  regulatoryClearance: string;
  fontsUsed: string;
  imagesPhotography: string;
  illustrationsIcons: string;
  colourCodes: string;
  thirdPartyLogosIp: string;
  supplierPrinter: string;
  outputFilesList: string;
  printProofRef: string;
  packagingDielineRef: string;
  changeLog: string;
  relatedArtworks: string;
  briefSpecLink: string;
  generalNotes: string;
};

export type ArchiveArtworkMetadataMissingGroup = {
  section: string;
  fields: string[];
};

export type ArchiveArtworkMetadataFieldKey = keyof ArchiveArtworkMetadataDraft;

export const archiveProjectWizardSteps = [
  "Final Files",
  "Archive Metadata",
  "Rights & Production Details",
  "Review & Archive",
] as const;

export const archiveDirectUploadWizardSteps = [
  "Files",
  "Identification & Classification",
  "Technical, Rights & Production",
  "Review & Archive",
] as const;

export const archiveArtworkTypeOptions = [
  "Packaging",
  "Promo Item",
  "Advertising & Print",
  "Digital & Website",
  "Video",
  "POSMs & Retail",
  "Corporate Identity",
  "Logos & Icons",
] as const;

export const archiveColourSpaceOptions = ["CMYK", "RGB", "Pantone", "Mixed"] as const;

export const archivePrintProcessOptions = [
  "Offset",
  "Rotogravure",
  "Flexo",
  "Digital",
  "Screen",
  "Dry Offset",
  "Dye Sublimation",
] as const;

export const archiveStatusOptions = ["WIP", "Review", "Approved", "Archived"] as const;

export const requiredArchiveArtworkMetadataFields: Array<{
  section: string;
  label: string;
  key: ArchiveArtworkMetadataFieldKey;
}> = [
  { section: "Identification", label: "Artwork ID", key: "artworkId" },
  { section: "Identification", label: "Title / Working name", key: "titleWorkingName" },
  { section: "Identification", label: "Version / Revision", key: "versionRevision" },
  { section: "Identification", label: "Language / Market", key: "languageMarket" },
  { section: "Classification", label: "Artwork type", key: "artworkType" },
  { section: "Classification", label: "Brand / Sub-brand", key: "brandSubBrand" },
  { section: "Technical Specs", label: "Colour space", key: "colourSpace" },
  { section: "Technical Specs", label: "File format(s)", key: "fileFormats" },
  { section: "Dates & Status", label: "Creation date", key: "creationDate" },
  { section: "Dates & Status", label: "Last modified", key: "lastModifiedDate" },
  { section: "Dates & Status", label: "Status", key: "archiveStatus" },
  { section: "Ownership & Approvals", label: "Created by", key: "createdByName" },
  { section: "Ownership & Approvals", label: "Approved by", key: "approvedByName" },
  { section: "Ownership & Approvals", label: "Client / Brand owner", key: "clientBrandOwner" },
  { section: "Assets & Rights", label: "Fonts used", key: "fontsUsed" },
  { section: "Assets & Rights", label: "Images / Photography", key: "imagesPhotography" },
  { section: "Assets & Rights", label: "Illustrations / Icons", key: "illustrationsIcons" },
  { section: "Assets & Rights", label: "Colour codes", key: "colourCodes" },
  { section: "Notes & Links", label: "Change log", key: "changeLog" },
];

export function formatArchiveMetadataDate(
  value: Date | string | number | null | undefined,
) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function getArchiveArtworkMetadataMissingGroups(
  metadata: ArchiveArtworkMetadataDraft,
) {
  const grouped = new Map<string, string[]>();

  requiredArchiveArtworkMetadataFields.forEach((field) => {
    if (metadata[field.key]?.trim()) {
      return;
    }

    grouped.set(field.section, [...(grouped.get(field.section) ?? []), field.label]);
  });

  return Array.from(grouped.entries()).map(([section, fields]) => ({
    section,
    fields,
  })) satisfies ArchiveArtworkMetadataMissingGroup[];
}

export function getArchiveArtworkMetadataMissingCount(
  metadata: ArchiveArtworkMetadataDraft,
) {
  return getArchiveArtworkMetadataMissingGroups(metadata).reduce(
    (count, group) => count + group.fields.length,
    0,
  );
}

export function getArchiveMetadataFileExtension(fileName: string) {
  const trimmed = fileName.trim();
  const extensionStart = trimmed.lastIndexOf(".");

  if (extensionStart <= 0 || extensionStart === trimmed.length - 1) {
    return "";
  }

  return trimmed.slice(extensionStart + 1).toUpperCase();
}

export function getArchiveMetadataFileNameStem(fileName: string) {
  const trimmed = fileName.trim();
  const extensionStart = trimmed.lastIndexOf(".");

  return extensionStart > 0 ? trimmed.slice(0, extensionStart) : trimmed;
}

export function buildDirectArchiveArtworkMetadataDraft(input: {
  fileName: string;
  uploadedAt: Date;
  createdByName: string;
}) {
  const date = formatArchiveMetadataDate(input.uploadedAt);
  const title = getArchiveMetadataFileNameStem(input.fileName);
  const fileFormat = getArchiveMetadataFileExtension(input.fileName);
  const userName = input.createdByName.trim() || "Current user";

  return {
    artworkId: "",
    titleWorkingName: title,
    versionRevision: "v1",
    languageMarket: "",
    artworkType: "",
    brandSubBrand: "",
    productSku: "",
    campaignProject: "",
    formatDimensions: "",
    colourSpace: "",
    resolution: "",
    fileFormats: fileFormat,
    printProcess: "",
    specialFinishes: "",
    creationDate: date,
    lastModifiedDate: date,
    goLiveOnShelfDate: "",
    expirySunsetDate: "",
    archiveStatus: "Archived",
    createdByName: userName,
    approvedByName: userName,
    approvedAt: date,
    clientBrandOwner: "",
    regulatoryClearance: "",
    fontsUsed: "",
    imagesPhotography: "",
    illustrationsIcons: "",
    colourCodes: "",
    thirdPartyLogosIp: "",
    supplierPrinter: "",
    outputFilesList: input.fileName,
    printProofRef: "",
    packagingDielineRef: "",
    changeLog: "Direct archive upload.",
    relatedArtworks: "",
    briefSpecLink: "",
    generalNotes: "",
  } satisfies ArchiveArtworkMetadataDraft;
}
