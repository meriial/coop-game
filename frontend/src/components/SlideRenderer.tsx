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
  IconGrid,
  type BulletItem,
  type GridItem,
} from "./slide-kit";

interface Props {
  index: number;
}

const slides = [<Slide0 />, <Slide1 />, <Slide2 />];

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
        <IconBadge icon={Heart} />
        <H1>Building with AI</H1>
        <Subtext>less wand, more wizard</Subtext>
        <TagRow>
          <Tag>Cloudflare Workers</Tag>
          <Tag accent="pink">Durable Objects</Tag>
          <Tag accent="emerald">Real-time WebSockets</Tag>
        </TagRow>
      </Stack>
    </Slide>
  );
}

const slide1Items: BulletItem[] = [
  {
    icon: Zap,
    label: "Real-time WebSocket server",
    sub: "on Cloudflare Workers",
  },
  {
    icon: Database,
    label: "Durable Objects",
    sub: "for persistent shared game state",
  },
  {
    icon: Package,
    label: "Browser SDK",
    sub: "TypeScript client anyone can drop in",
  },
  {
    icon: Grid2x2,
    label: "Cooperative pixel art game",
    sub: "fill the heart together",
  },
];

function Slide1() {
  return (
    <Slide bg="line" accent="indigo">
      <Content>
        <Header label="Today's Goal" heading="The Game Plan" />
        <BulletList items={slide1Items} />
      </Content>
    </Slide>
  );
}

const slide2Items: GridItem[] = [
  { icon: Sparkles, label: "Confetti on victory" },
  { icon: Bot, label: "Auto-bot that fills cells" },
  { icon: Volume2, label: "Sound effects on paint" },
  { icon: Pipette, label: "Custom color picker" },
  { icon: BarChart2, label: "Personal score counter" },
  { icon: ImageIcon, label: "New target image" },
];

function Slide2() {
  return (
    <Slide bg="pixel" accent="emerald">
      <Content>
        <Header label="What's Next" heading="Keep Building" />
        <IconGrid items={slide2Items} />
      </Content>
    </Slide>
  );
}
