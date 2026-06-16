"use client";

import { useRef, useState } from "react";
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
  favoriteApiPath?: string;
};

export function AttachmentFavoriteButton({
  attachmentId,
  initialIsFavorited,
  className,
  iconClassName,
  showToast = true,
  onChange,
  favoriteApiPath,
}: AttachmentFavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const latestRequestIdRef = useRef(0);
  const apiPath = favoriteApiPath ?? `/api/project-assets/${attachmentId}/favorite`;

  function handleToggle() {
    const nextState = !isFavorited;
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    setIsFavorited(nextState);
    onChange?.(nextState);

    if (showToast) {
      showSuccessToast(
        nextState ? "Added to favourites." : "Removed from favourites.",
      );
    }

    fetch(apiPath, {
      method: nextState ? "POST" : "DELETE",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          isFavoritedByCurrentUser?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to update favourites right now.");
        }

        return payload.isFavoritedByCurrentUser ?? nextState;
      })
      .then((confirmedState) => {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setIsFavorited(confirmedState);
        onChange?.(confirmedState);
      })
      .catch((error) => {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setIsFavorited(!nextState);
        onChange?.(!nextState);
        showErrorToast(
          "Unable to update favourites.",
          error instanceof Error ? error.message : "Try again in a moment.",
        );
      });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleToggle}
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
