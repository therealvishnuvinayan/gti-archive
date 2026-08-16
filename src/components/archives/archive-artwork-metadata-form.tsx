"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppDatePicker } from "@/components/calendar/app-date-picker";
import {
  archiveArtworkTypeOptions,
  archiveColourSpaceOptions,
  archivePrintProcessOptions,
  archiveStatusOptions,
  getArchiveArtworkMetadataMissingCount,
  getArchiveArtworkMetadataMissingGroups,
  type ArchiveArtworkMetadataDraft,
  type ArchiveArtworkMetadataFieldKey,
} from "@/lib/archive-artwork-metadata";

export type ArchiveMetadataWizardFile = {
  id: string;
  originalFileName: string;
  metadata: ArchiveArtworkMetadataDraft;
};

type ArchiveMetadataChangeHandler = (
  fileId: string,
  field: ArchiveArtworkMetadataFieldKey,
  value: string,
) => void;

type ArchiveMetadataFieldProps = {
  fileId: string;
  metadata: ArchiveArtworkMetadataDraft;
  field: ArchiveArtworkMetadataFieldKey;
  label: string;
  onChange: ArchiveMetadataChangeHandler;
  disabled?: boolean;
  required?: boolean;
  type?: "text" | "date" | "textarea";
  options?: readonly string[];
};

export function ArchiveArtworkMetadataField({
  fileId,
  metadata,
  field,
  label: labelText,
  onChange,
  disabled,
  required,
  type = "text",
  options,
}: ArchiveMetadataFieldProps) {
  const value = metadata[field] ?? "";
  const isMissing = Boolean(required && !value.trim());
  const inputId = `archive-${fileId}-${String(field)}`;
  const label = (
    <label
      htmlFor={inputId}
      className="text-[11px] font-[800] uppercase tracking-[0.08em] text-[#6c786f]"
    >
      {labelText}
      {required ? " *" : ""}
    </label>
  );

  if (options) {
    return (
      <div className="space-y-1.5">
        {label}
        <Select
          value={value}
          onValueChange={(nextValue) => onChange(fileId, field, nextValue)}
          disabled={disabled}
        >
          <SelectTrigger
            id={inputId}
            className={`h-10 rounded-[14px] border ${
              isMissing ? "border-[#df6f66]" : "border-line"
            }`}
          >
            <SelectValue placeholder={`Select ${labelText.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent className="z-[230]">
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div className="space-y-1.5">
        {label}
        <RichTextEditor
          id={inputId}
          value={value}
          onChange={(nextValue) => onChange(fileId, field, nextValue)}
          disabled={disabled}
          minHeightClassName="min-h-[96px]"
          ariaLabel={labelText}
          required={required}
          error={isMissing}
        />
      </div>
    );
  }

  if (type === "date") {
    return (
      <div className="space-y-1.5">
        {label}
        <AppDatePicker
          id={inputId}
          value={value}
          onChange={(nextValue) => onChange(fileId, field, nextValue)}
          disabled={disabled}
          required={required}
          clearable={!required}
          popoverZIndex={230}
          placeholder={`Select ${labelText.toLowerCase()}`}
          triggerClassName={`h-10 w-full justify-between rounded-[14px] border bg-white px-3 text-left text-[13px] font-normal shadow-none hover:bg-white ${
            isMissing ? "border-[#df6f66]" : "border-line"
          }`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {label}
      <Input
        id={inputId}
        type="text"
        value={value}
        onChange={(event) => onChange(fileId, field, event.target.value)}
        disabled={disabled}
        className={`h-10 rounded-[14px] border ${
          isMissing ? "border-[#df6f66]" : "border-line"
        }`}
      />
    </div>
  );
}

export function ArchiveMetadataIdentificationStep({
  files,
  onChange,
  onApplyToAll,
  disabled,
  title = "Identification & Classification",
  description = "Complete Artwork Legend identification for each archive file.",
}: {
  files: ArchiveMetadataWizardFile[];
  onChange: ArchiveMetadataChangeHandler;
  onApplyToAll?: () => void;
  disabled?: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-[#fbfcfa] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-[800] text-[#173120]">{title}</p>
          <p className="mt-1 text-[12px] leading-5 text-[#687269]">{description}</p>
        </div>
        {onApplyToAll ? (
          <Button
            type="button"
            variant="secondary"
            className="rounded-full text-[12px]"
            onClick={onApplyToAll}
            disabled={disabled || files.length === 0}
          >
            Apply project metadata to all files
          </Button>
        ) : null}
      </div>

      {files.map((file) => {
        const missingCount = getArchiveArtworkMetadataMissingCount(file.metadata);

        return (
          <div
            key={file.id}
            className="space-y-4 rounded-[20px] border border-[#dbe4dc] bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[14px] font-[800] text-[#173120]">
                {file.originalFileName}
              </p>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-[800] ${
                  missingCount > 0
                    ? "bg-[#fff2f1] text-[#bb4d49]"
                    : "bg-[#edf7ef] text-[#2b8b56]"
                }`}
              >
                {missingCount > 0 ? `Missing ${missingCount}` : "Complete"}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="artworkId"
                label="Artwork ID"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="titleWorkingName"
                label="Title / Working name"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="versionRevision"
                label="Version / Revision"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="languageMarket"
                label="Language / Market"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="artworkType"
                label="Artwork type"
                required
                disabled={disabled}
                options={archiveArtworkTypeOptions}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="brandSubBrand"
                label="Brand / Sub-brand"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="productSku"
                label="Product / SKU"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="campaignProject"
                label="Campaign / Project"
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ArchiveMetadataTechnicalStep({
  files,
  onChange,
  disabled,
}: {
  files: ArchiveMetadataWizardFile[];
  onChange: ArchiveMetadataChangeHandler;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {files.map((file) => (
        <div
          key={file.id}
          className="space-y-5 rounded-[20px] border border-[#dbe4dc] bg-white p-4"
        >
          <p className="min-w-0 truncate text-[14px] font-[800] text-[#173120]">
            {file.originalFileName}
          </p>

          <div>
            <p className="mb-3 text-[12px] font-[800] uppercase tracking-[0.08em] text-[#2f8d5d]">
              Technical Specs
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="formatDimensions"
                label="Format / Dimensions"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="colourSpace"
                label="Colour space"
                required
                disabled={disabled}
                options={archiveColourSpaceOptions}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="resolution"
                label="Resolution"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="fileFormats"
                label="File format(s)"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="printProcess"
                label="Print process"
                disabled={disabled}
                options={archivePrintProcessOptions}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="specialFinishes"
                label="Special finishes"
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          </div>

          <div>
            <p className="mb-3 text-[12px] font-[800] uppercase tracking-[0.08em] text-[#2f8d5d]">
              Dates, Ownership & Approvals
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="creationDate"
                label="Creation date"
                type="date"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="lastModifiedDate"
                label="Last modified"
                type="date"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="archiveStatus"
                label="Status"
                required
                disabled={disabled}
                options={archiveStatusOptions}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="goLiveOnShelfDate"
                label="Go-live / On-shelf date"
                type="date"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="expirySunsetDate"
                label="Expiry / Sunset date"
                type="date"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="approvedAt"
                label="Approved at"
                type="date"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="createdByName"
                label="Created by"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="approvedByName"
                label="Approved by"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="clientBrandOwner"
                label="Client / Brand owner"
                required
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          </div>

          <div>
            <p className="mb-3 text-[12px] font-[800] uppercase tracking-[0.08em] text-[#2f8d5d]">
              Assets, Rights & Production
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="fontsUsed"
                label="Fonts used"
                type="textarea"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="imagesPhotography"
                label="Images / Photography"
                type="textarea"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="illustrationsIcons"
                label="Illustrations / Icons"
                type="textarea"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="colourCodes"
                label="Colour codes"
                type="textarea"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="thirdPartyLogosIp"
                label="3rd-party logos / IP"
                type="textarea"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="regulatoryClearance"
                label="Regulatory clearance"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="supplierPrinter"
                label="Supplier / Printer"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="outputFilesList"
                label="Output files list"
                type="textarea"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="printProofRef"
                label="Print proof ref"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="packagingDielineRef"
                label="Packaging dieline ref"
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="changeLog"
                label="Change log"
                type="textarea"
                required
                disabled={disabled}
                onChange={onChange}
              />
              <ArchiveArtworkMetadataField
                fileId={file.id}
                metadata={file.metadata}
                field="generalNotes"
                label="General notes"
                type="textarea"
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ArchiveMetadataReviewList({
  files,
  getFinalFileName,
  onEditMetadata,
  missingMetadataCount,
  fileCountLabel,
}: {
  files: ArchiveMetadataWizardFile[];
  getFinalFileName: (file: ArchiveMetadataWizardFile) => string;
  onEditMetadata: () => void;
  missingMetadataCount: number;
  fileCountLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-line bg-[#fbfcfa] p-4">
        <p className="text-[15px] font-[800] text-[#173120]">Review & Archive</p>
        <p className="mt-1 text-[12px] leading-5 text-[#687269]">
          Archive category, file names, and required Artwork Legend metadata must be
          complete before archive.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-[800]">
          <span className="rounded-full bg-[#edf7ef] px-3 py-1 text-[#2b8b56]">
            {fileCountLabel}
          </span>
          <span
            className={`rounded-full px-3 py-1 ${
              missingMetadataCount > 0
                ? "bg-[#fff2f1] text-[#bb4d49]"
                : "bg-[#edf7ef] text-[#2b8b56]"
            }`}
          >
            {missingMetadataCount > 0
              ? `${missingMetadataCount} metadata fields missing`
              : "Metadata complete"}
          </span>
        </div>
      </div>

      {files.map((file) => {
        const missingGroups = getArchiveArtworkMetadataMissingGroups(file.metadata);

        return (
          <div
            key={file.id}
            className="rounded-[20px] border border-[#dbe4dc] bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-[800] text-[#173120]">
                  {file.metadata.artworkId || "Artwork ID missing"} ·{" "}
                  {file.metadata.titleWorkingName || file.originalFileName}
                </p>
                <p className="mt-1 text-[12px] text-[#687269]">
                  {file.metadata.brandSubBrand || "Brand missing"} ·{" "}
                  {file.metadata.artworkType || "Artwork type missing"} ·{" "}
                  {file.metadata.languageMarket || "Market missing"}
                </p>
                <p className="mt-1 text-[12px] text-[#687269]">
                  Final name: {getFinalFileName(file)}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full text-[12px]"
                onClick={onEditMetadata}
              >
                Edit Metadata
              </Button>
            </div>
            {missingGroups.length > 0 ? (
              <div className="mt-4 rounded-[16px] border border-[#f0c9c7] bg-[#fff7f6] p-3">
                <p className="text-[12px] font-[800] text-[#bb4d49]">
                  Missing archive metadata
                </p>
                <ul className="mt-2 space-y-1 text-[12px] leading-5 text-[#8d4944]">
                  {missingGroups.map((group) => (
                    <li key={group.section}>
                      {group.section}: {group.fields.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 rounded-[16px] border border-[#cfe6d5] bg-[#f3fbf4] px-3 py-2 text-[12px] font-[800] text-[#2b8b56]">
                Required metadata complete.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
