export function Jp({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  const re = /\{([^|{]+)\|([^}]+)\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <ruby key={i++}>
        {match[1]}
        <rt>{match[2]}</rt>
      </ruby>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
