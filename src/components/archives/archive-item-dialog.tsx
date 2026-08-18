"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { updateArchivedFileInformationAction } from "@/app/(dashboard)/archives/actions";
import {
  ArchiveMetadataIdentificationStep,
  ArchiveMetadataTechnicalStep,
} from "@/components/archives/archive-artwork-metadata-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArchiveArtworkMetadataDraft } from "@/lib/archive-artwork-metadata";
import type {
  ArchivedFileInformationUpdate,
  ArchivedProjectFileRecord,
  ArchiveArtworkMetadataSummary,
} from "@/lib/archives";

type ArchiveItemDialogProps = {
  item: ArchivedProjectFileRecord;
  onClose: () => void;
  onSaved: (file: ArchivedFileInformationUpdate) => void;
};

function toArchiveArtworkMetadataDraft(
  metadata: ArchiveArtworkMetadataSummary,
): ArchiveArtworkMetadataDraft {
  return {
    artworkId: metadata.artworkId,
    titleWorkingName: metadata.titleWorkingName,
    versionRevision: metadata.versionRevision,
    languageMarket: metadata.languageMarket,
    artworkType: metadata.artworkType,
    brandSubBrand: metadata.brandSubBrand,
    productSku: metadata.productSku ?? "",
    campaignProject: metadata.campaignProject ?? "",
    formatDimensions: metadata.formatDimensions ?? "",
    colourSpace: metadata.colourSpace,
    resolution: metadata.resolution ?? "",
    fileFormats: metadata.fileFormats,
    printProcess: metadata.printProcess ?? "",
    specialFinishes: metadata.specialFinishes ?? "",
    creationDate: metadata.creationDate,
    lastModifiedDate: metadata.lastModifiedDate,
    goLiveOnShelfDate: metadata.goLiveOnShelfDate ?? "",
    expirySunsetDate: metadata.expirySunsetDate ?? "",
    archiveStatus: metadata.archiveStatus,
    createdByName: metadata.createdByName,
    approvedByName: metadata.approvedByName,
    approvedAt: metadata.approvedAt ?? "",
    clientBrandOwner: metadata.clientBrandOwner,
    regulatoryClearance: metadata.regulatoryClearance ?? "",
    fontsUsed: metadata.fontsUsed,
    imagesPhotography: metadata.imagesPhotography,
    illustrationsIcons: metadata.illustrationsIcons,
    colourCodes: metadata.colourCodes,
    thirdPartyLogosIp: metadata.thirdPartyLogosIp ?? "",
    supplierPrinter: metadata.supplierPrinter ?? "",
    outputFilesList: metadata.outputFilesList ?? "",
    printProofRef: metadata.printProofRef ?? "",
    packagingDielineRef: metadata.packagingDielineRef ?? "",
    changeLog: metadata.changeLog,
    relatedArtworks: metadata.relatedArtworks ?? "",
    briefSpecLink: metadata.briefSpecLink ?? "",
    generalNotes: metadata.generalNotes ?? "",
  };
}

export function ArchiveItemDialog({
  item,
  onClose,
  onSaved,
}: ArchiveItemDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [finalArchiveFileName, setFinalArchiveFileName] = useState(
    item.finalArchiveFileName,
  );
  const [artworkMetadata, setArtworkMetadata] =
    useState<ArchiveArtworkMetadataDraft | null>(() =>
      item.artworkMetadata
        ? toArchiveArtworkMetadataDraft(item.artworkMetadata)
        : null,
    );
  const metadataFiles = artworkMetadata
    ? [
        {
          id: item.id,
          originalFileName: item.originalFileName,
          metadata: artworkMetadata,
        },
      ]
    : [];

  function updateArtworkMetadata(
    _fileId: string,
    field: keyof ArchiveArtworkMetadataDraft,
    value: string,
  ) {
    setArtworkMetadata((current) =>
      current ? { ...current, [field]: value } : current,
    );
  }

  function saveArchiveInformation() {
    startTransition(async () => {
      const result = await updateArchivedFileInformationAction({
        archivedFileId: item.id,
        finalArchiveFileName,
        artworkMetadata: artworkMetadata ?? undefined,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      onSaved(result.file);
      toast.success("Archive file information updated.");
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-[#112118]/45 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-edit-dialog-title"
    >
      <div className="flex max-h-[calc(100vh-4rem)] w-full max-w-[1080px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2
              id="archive-edit-dialog-title"
              className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]"
            >
              Edit Archive Information
            </h2>
            <p className="mt-1 text-[14px] text-[#6a706b]">
              Rename this archived file and update its existing artwork metadata.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#253029] disabled:opacity-50"
            aria-label="Close archive item dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-[20px] border border-line bg-[#fbfcfa] p-4">
            <label htmlFor={`archive-file-name-${item.id}`}>
              <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                Archive file name
              </span>
              <Input
                id={`archive-file-name-${item.id}`}
                value={finalArchiveFileName}
                onChange={(event) =>
                  setFinalArchiveFileName(event.target.value)
                }
                disabled={isPending}
                className="h-11 rounded-[14px] border border-line"
              />
            </label>
            <p className="mt-2 text-[12px] text-[#6a706b]">
              Keep the original file extension.
            </p>
          </div>

          {artworkMetadata ? (
            <>
              <ArchiveMetadataIdentificationStep
                files={metadataFiles}
                onChange={updateArtworkMetadata}
                disabled={isPending}
                title="Identification & Classification"
                description="Update the existing Artwork Legend identification for this archived file."
              />
              <ArchiveMetadataTechnicalStep
                files={metadataFiles}
                onChange={updateArtworkMetadata}
                disabled={isPending}
              />
            </>
          ) : (
            <div className="rounded-[18px] border border-line bg-[#fbfcfa] p-4 text-[13px] leading-5 text-[#687269]">
              This historical file has no artwork metadata record. Its archive file
              name can still be edited.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            disabled={isPending}
            className="min-h-[46px] px-6 text-[14px] font-[700] text-[#2f3a32]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={saveArchiveInformation}
            disabled={isPending || !finalArchiveFileName.trim()}
            className="min-h-[46px] px-7 text-[14px] font-[700]"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
