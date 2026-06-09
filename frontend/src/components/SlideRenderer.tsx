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
  H2,
} from "./slide-kit";

interface Props {
  index: number;
}

const slides = [
  <Why />,
  <MoreWandLessWizard />,
  <PrinciplesAndPatterns />,
  <AlwaysBePrompting />,
  <WhatsGoodForAHuman />,
  <BeDeterministic />,
  <InvestInThingsThatCompound />,
  <MoveAsMuchAsYouCan />,
  <LearnAsMuchAsYouCan />,
  <ThreeAgentModel />,
  <ConnectAsMuchAsYouCan />,
  <TheEndOfTheIC />,
  <Collaboration />,
  <Curiosity />,
  <Empathy />,
  <MagicPromptKeepGoing />,
  <MagicPromptNowMakeItPass />,
  <MagicPromptTeachMe />,
  <MagicPromptUseFewerTokens />,
  <MagicPromptGetItRight />,
  <Quality />,
  <Capability />,
  <QualityQuestions />,
];

export function SlideRenderer({ index }: Props) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      {slides[index] ?? (
        <div className="text-slate-500 text-2xl">Slide {index}</div>
      )}
    </div>
  );
}

function Why() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Why?</H1>
      </Stack>
    </Slide>
  );
}

function MoreWandLessWizard() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>
          Less Wand
          <br />
          More Wizard
        </H1>
      </Stack>
    </Slide>
  );
}

function PrinciplesAndPatterns() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Principles and Patterns</H1>
      </Stack>
    </Slide>
  );
}

function AlwaysBePrompting() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>#always-be-prompting</H1>
      </Stack>
    </Slide>
  );
}

function WhatsGoodForAHuman() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H2>
          What's good for a human
          <br />
          is good for an agent
          <br />
          (and vice versa)
        </H2>
      </Stack>
    </Slide>
  );
}

function BeDeterministic() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H2>
          Don't use an agent
          <br /> to do a calculator's job
        </H2>
      </Stack>
    </Slide>
  );
}

function InvestInThingsThatCompound() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>
          Invest in things
          <br /> that compound
        </H1>
      </Stack>
    </Slide>
  );
}

function LearnAsMuchAsYouCan() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Learn</H1>
        <Subtext>as much as you can</Subtext>
      </Stack>
    </Slide>
  );
}

function ConnectAsMuchAsYouCan() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Connect</H1>
        <Subtext>as much as you can</Subtext>
      </Stack>
    </Slide>
  );
}

function MoveAsMuchAsYouCan() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Move</H1>
        <Subtext>as much as you can</Subtext>
      </Stack>
    </Slide>
  );
}

function MagicPromptKeepGoing() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <Subtext>Magic Prompt</Subtext>
        <H1>Keep Going</H1>
      </Stack>
    </Slide>
  );
}

function MagicPromptNowMakeItPass() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <Subtext>Magic Prompt</Subtext>
        <H1>Now Make It Pass</H1>
      </Stack>
    </Slide>
  );
}

function MagicPromptTeachMe() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <Subtext>Magic Prompt</Subtext>
        <H1>Teach Me</H1>
      </Stack>
    </Slide>
  );
}

function MagicPromptUseFewerTokens() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <Subtext>Magic Prompt</Subtext>
        <H1>Use Fewer Tokens</H1>
      </Stack>
    </Slide>
  );
}

function MagicPromptGetItRight() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <Subtext>Magic Prompt</Subtext>
        <H1>Get It Right</H1>
        <Subtext>the first time</Subtext>
      </Stack>
    </Slide>
  );
}

function ThreeAgentModel() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>The Three Agent Model</H1>
      </Stack>
    </Slide>
  );
}

function TheEndOfTheIC() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>The End of the IC</H1>
      </Stack>
    </Slide>
  );
}

function Collaboration() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <Subtext>The two skills of</Subtext>
        <H1>Collaboration</H1>
      </Stack>
    </Slide>
  );
}

function Curiosity() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>1. Curiosity</H1>
      </Stack>
    </Slide>
  );
}

function Empathy() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>2. Empathy</H1>
      </Stack>
    </Slide>
  );
}

function Quality() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Quality Matters</H1>
      </Stack>
    </Slide>
  );
}

function Capability() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Quality Thinking</H1>
        <H1>Quality Connection</H1>
      </Stack>
    </Slide>
  );
}

function QualityQuestions() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Quality Questions</H1>
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
