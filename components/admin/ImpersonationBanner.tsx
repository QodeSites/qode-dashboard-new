"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface ImpersonationBannerProps {
  name: string;
  icode: string;
  onExit: () => void;
  exitLabel?: string;
}

export function ImpersonationBanner({ name, icode, onExit, exitLabel = "Back to Admin" }: ImpersonationBannerProps) {
  return (
    <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-between">
      <p className="text-sm text-amber-800">
        Viewing dashboard as: <strong>{name}</strong> ({icode})
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onExit}
        className="gap-2 text-amber-800 hover:text-amber-900 hover:bg-amber-100"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {exitLabel}
      </Button>
    </div>
  );
}
