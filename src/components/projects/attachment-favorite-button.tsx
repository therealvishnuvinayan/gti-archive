"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type AttachmentFavoriteButtonProps = {
  attachmentId: string;
  initialIsFavorited: boolean;
  className?: string;
  iconClassName?: string;
  showToast?: boolean;
  onChange?: (isFavorited: boolean) => void;
};

export function AttachmentFavoriteButton({
  attachmentId,
  initialIsFavorited,
  className,
  iconClassName,
  showToast = true,
  onChange,
}: AttachmentFavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const nextState = !isFavorited;
    setIsFavorited(nextState);
    onChange?.(nextState);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/project-assets/${attachmentId}/favorite`, {
          method: nextState ? "POST" : "DELETE",
        });
        const payload = (await response.json()) as {
          error?: string;
          isFavoritedByCurrentUser?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to update favourites right now.");
        }

        const confirmedState = payload.isFavoritedByCurrentUser ?? nextState;
        setIsFavorited(confirmedState);
        onChange?.(confirmedState);

        if (showToast) {
          showSuccessToast(
            confirmedState ? "Added to favourites." : "Removed from favourites.",
          );
        }
      } catch (error) {
        setIsFavorited(!nextState);
        onChange?.(!nextState);
        showErrorToast(
          "Unable to update favourites.",
          error instanceof Error ? error.message : "Try again in a moment.",
        );
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={isPending}
      className={className}
      aria-label={isFavorited ? "Remove from favourites" : "Add to favourites"}
      title={isFavorited ? "Remove from favourites" : "Add to favourites"}
    >
      <Heart
        className={`${iconClassName ?? "h-4 w-4"} transition-all duration-200 ${
          isFavorited
            ? "fill-[#db7a88] text-[#db7a88] scale-105"
            : "text-[#7a847d] hover:text-[#b96a77]"
        }`}
      />
    </Button>
  );
}
