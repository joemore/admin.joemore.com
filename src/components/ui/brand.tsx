import Link from "next/link";

export function Brand({
  compact = false,
  href = "/dashboard",
}: {
  compact?: boolean;
  href?: string;
}) {
  return (
    <Link href={href} className="brand" aria-label="joemore.com Admin home">
      <span className="brand-mark" aria-hidden="true">
        jm<span>.</span>
      </span>
      {!compact && (
        <span className="brand-wordmark">
          joemore<span>.com</span>
          <small>ADMIN WORKSPACE</small>
        </span>
      )}
    </Link>
  );
}
