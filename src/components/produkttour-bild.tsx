"use client";

import Image from "next/image";
import { ZoomInIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ProdukttourBild({
  src,
  alt,
  breite,
  hoehe,
}: {
  src: string;
  alt: string;
  breite: number;
  hoehe: number;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border shadow-sm"
        aria-label={`${alt} vergrößern`}
      >
        <Image
          src={src}
          alt={alt}
          width={breite}
          height={hoehe}
          className="h-auto w-full"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
          <ZoomInIcon className="size-8 text-white opacity-0 transition group-hover:opacity-100" />
        </span>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-4xl">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <Image
          src={src}
          alt={alt}
          width={breite}
          height={hoehe}
          className="h-auto w-full rounded-md"
        />
      </DialogContent>
    </Dialog>
  );
}
