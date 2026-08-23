import Image from "next/image";

export function MobemboLogo({
  className = "h-9 w-auto",
  alt = "Mobembo",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/brand/mobembo-logo.png"
      alt={alt}
      width={180}
      height={60}
      loading="eager"
      className={className}
    />
  );
}
