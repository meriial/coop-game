import {
  Zap,
  Database,
  Package,
  Grid2x2,
  Sparkles,
  Bot,
  Volume2,
  Pipette,
  BarChart2,
  ImageIcon,
  Heart,
} from "lucide-react";
import {
  Slide,
  Content,
  Stack,
  H1,
  Header,
  Subtext,
  IconBadge,
  Tag,
  TagRow,
  BulletList,
  BulletListItem,
  IconGrid,
  IconGridItem,
} from "./slide-kit";

interface Props {
  index: number;
}

const slides = [<Slide0 />, <Slide1 />, <Slide2 />, <Slide3 />];

export function SlideRenderer({ index }: Props) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      {slides[index] ?? (
        <div className="text-slate-500 text-2xl">Slide {index}</div>
      )}
    </div>
  );
}

function Slide0() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>
          Less Wand
          <br />
          More Wizard
        </H1>
        <TagRow>
          <Tag>Collaboration</Tag>
          <Tag accent="pink">Capability</Tag>
          <Tag accent="emerald">Quality</Tag>
        </TagRow>
      </Stack>
    </Slide>
  );
}

function Slide1() {
  return (
    <Slide bg="line" accent="indigo">
      <Content>
        <Header label="Today's Goal" heading="The Game Plan" />
        <BulletList>
          <BulletListItem
            icon={Zap}
            label="Real-time WebSocket server"
            sub="on Cloudflare Workers"
          />
          <BulletListItem
            icon={Database}
            label="Durable Objects"
            sub="for persistent shared game state"
          />
          <BulletListItem
            icon={Package}
            label="Browser SDK"
            sub="TypeScript client anyone can drop in"
          />
          <BulletListItem
            icon={Grid2x2}
            label="Cooperative pixel art game"
            sub="fill the heart together"
          />
        </BulletList>
      </Content>
    </Slide>
  );
}

function Slide2() {
  return (
    <Slide bg="pixel" accent="emerald">
      <Content>
        <Header label="What's Next" heading="Keep Building" />
        <IconGrid>
          <IconGridItem icon={Sparkles} label="Confetti on victory" />
          <IconGridItem icon={Bot} label="Auto-bot that fills cells" />
          <IconGridItem icon={Volume2} label="Sound effects on paint" />
          <IconGridItem icon={Pipette} label="Custom color picker" />
          <IconGridItem icon={BarChart2} label="Personal score counter" />
          <IconGridItem icon={ImageIcon} label="New target image" />
        </IconGrid>
      </Content>
    </Slide>
  );
}

function Slide3() {
  return (
    <Slide bg="line" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Quick Poll</H1>
      </Stack>
    </Slide>
  );
}
