import GoogleMapComponent from "@/components/GoogleMap";
import IntroAnimation from "@/components/IntroAnimation";

export default function Home() {
  return (
    <>
      <IntroAnimation />
      <main className="flex h-screen flex-col overflow-hidden">
        <GoogleMapComponent />
      </main>
    </>
  );
}
