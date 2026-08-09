import { ProjectFileChecklistField } from "@prisma/client";

export type StageFiveChecklistControl =
  | "text"
  | "textarea"
  | "file"
  | "multi-file"
  | "health-warning"
  | "multi-value"
  | "finishes"
  | "text-attachment";

export type StageFiveFieldDefinition = {
  key: ProjectFileChecklistField;
  title: string;
  helper: string;
  control: StageFiveChecklistControl;
  placeholder?: string;
  suggestions?: string[];
};

export const STAGE_FIVE_FIELD_DEFINITIONS: StageFiveFieldDefinition[] = [
  {
    key: ProjectFileChecklistField.OUTPUT_NAME,
    title: "Output Name",
    helper: "The name of the output file",
    control: "text",
    placeholder: "Enter output name",
  },
  {
    key: ProjectFileChecklistField.TECHNICAL_DRAWING,
    title: "Technical Drawing",
    helper: "Upload one or more technical drawing files",
    control: "multi-file",
  },
  {
    key: ProjectFileChecklistField.HEALTH_WARNING,
    title: "Health Warning",
    helper: "Add warning text, a reference file, or both",
    control: "health-warning",
    placeholder: "Enter the required health warning",
  },
  {
    key: ProjectFileChecklistField.TAR,
    title: "Tar",
    helper: "The required tar information",
    control: "text",
    placeholder: "Enter tar information",
  },
  {
    key: ProjectFileChecklistField.NICOTINE,
    title: "Nicotine",
    helper: "The required nicotine information",
    control: "text",
    placeholder: "Enter nicotine information",
  },
  {
    key: ProjectFileChecklistField.COMPULSORY_TEXT,
    title: "Compulsory Text",
    helper: "Add each mandatory text requirement separately",
    control: "multi-value",
    placeholder: "Enter compulsory text",
  },
  {
    key: ProjectFileChecklistField.MARKETING_COPY,
    title: "Marketing Copy",
    helper: "Add one or more lines of approved marketing copy",
    control: "multi-value",
    placeholder: "Enter marketing copy",
  },
  {
    key: ProjectFileChecklistField.RELATED_GRAPHICS,
    title: "Related Graphics",
    helper: "Add logos, illustrations, and other related graphics",
    control: "multi-file",
  },
  {
    key: ProjectFileChecklistField.PRINTING_TECHNOLOGY,
    title: "Printing Technology",
    helper: "Select or enter the required printing technologies",
    control: "multi-value",
    suggestions: ["Offset Printing", "Digital Printing", "Flexographic", "Gravure"],
  },
  {
    key: ProjectFileChecklistField.FINISHES,
    title: "Finishes",
    helper: "Add finishes and optional reference files",
    control: "finishes",
    suggestions: ["Matte Lamination", "Gloss Lamination", "Spot UV", "Embossing", "Foil"],
  },
  {
    key: ProjectFileChecklistField.BARCODE,
    title: "Barcode",
    helper: "Enter the barcode number",
    control: "text",
    placeholder: "Enter barcode number",
  },
  {
    key: ProjectFileChecklistField.TRACK_TRACE,
    title: "Track & Trace",
    helper: "Add dimensions, location, placement, or a reference file",
    control: "text-attachment",
    placeholder: "Describe track and trace placement",
  },
  {
    key: ProjectFileChecklistField.THREEDS,
    title: "3D's",
    helper: "Add 3D files, renders, or visualizations",
    control: "multi-file",
  },
  {
    key: ProjectFileChecklistField.TAX_STAMP,
    title: "Tax Stamp",
    helper: "Add tax stamp details and an optional reference",
    control: "text-attachment",
    placeholder: "Enter tax stamp requirements",
  },
  {
    key: ProjectFileChecklistField.QR_CODE,
    title: "QR Code",
    helper: "Add one or more required QR code files",
    control: "multi-file",
  },
  {
    key: ProjectFileChecklistField.INVOICE,
    title: "Invoice",
    helper: "Add the invoice file for this project",
    control: "file",
  },
];

export const STAGE_FIVE_FIELD_KEYS = STAGE_FIVE_FIELD_DEFINITIONS.map(
  (field) => field.key,
) as ProjectFileChecklistField[];

export const STAGE_FIVE_FIELD_LABELS = Object.fromEntries(
  [
    ...STAGE_FIVE_FIELD_DEFINITIONS.map((field) => [field.key, field.title] as const),
    [ProjectFileChecklistField.TAR_NICOTINE, "Tar / Nicotine (Legacy)"] as const,
  ],
) as Record<ProjectFileChecklistField, string>;

export function getStageFiveFieldDefinition(fieldKey: ProjectFileChecklistField) {
  if (fieldKey === ProjectFileChecklistField.TAR_NICOTINE) {
    return STAGE_FIVE_FIELD_DEFINITIONS.find(
      (field) => field.key === ProjectFileChecklistField.TAR,
    ) ?? null;
  }
  return STAGE_FIVE_FIELD_DEFINITIONS.find((field) => field.key === fieldKey) ?? null;
}
