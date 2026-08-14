interface ScreenHeadingProps {
  title: string;
  subtitle?: string;
}

export function ScreenHeading({ title, subtitle }: ScreenHeadingProps) {
  return (
    <header className="vindicate-screen-heading-block">
      <h2 className="vindicate-screen-heading">{title}</h2>
      {subtitle && <p className="vindicate-screen-sub">{subtitle}</p>}
    </header>
  );
}
