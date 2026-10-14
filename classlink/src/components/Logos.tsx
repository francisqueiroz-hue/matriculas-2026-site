import Image from "next/image";

// Logos institucionais. Dimensões = tamanho real dos arquivos em /public/logos,
// para o navegador reservar o espaço certo (sem salto de layout).
// A altura visual é controlada por `className` (ex.: "h-8").
type Props = { className?: string };

export function LogoEspacoKids({ className = "h-8" }: Props) {
  return (
    <Image
      src="/logos/logo-espaco-kids.png"
      alt="Espaço Kids"
      width={366}
      height={164}
      className={`${className} w-auto object-contain`}
    />
  );
}

export function LogoInstitutoFokus({ className = "h-8" }: Props) {
  return (
    <Image
      src="/logos/logo-instituto-fokus.png"
      alt="Instituto Fokus"
      width={189}
      height={188}
      className={`${className} w-auto object-contain`}
    />
  );
}
