interface SessionThumbProps {
  readonly thumbnailUrl?: string;
}

export function SessionThumb({ thumbnailUrl }: SessionThumbProps) {
  if (thumbnailUrl !== undefined) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-vs-hover text-vs-text-dim text-ui-sm">
      No preview
    </div>
  );
}
