import { Slide, Stack, H1, Subtext } from './components/slide-kit';

export function VictoriaApp() {
  return (
    <div className="w-screen h-screen bg-slate-950">
      <Slide bg="dot" accent="emerald">
        <Stack gap="lg" align="center">
          <H1>Hello, World</H1>
          <Subtext>Victoria</Subtext>
        </Stack>
      </Slide>
    </div>
  );
}
