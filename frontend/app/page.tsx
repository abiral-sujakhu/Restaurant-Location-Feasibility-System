import GoogleMapComponent from "@/components/GoogleMap";

export default function Home() {
  return (
    <main className="flex h-screen flex-col overflow-hidden p-5">
      <header className="mb-5 text-center">
        <h1 className="text-3xl font-bold">
          Restaurant Location Feasibility System
        </h1>

        <p className="mt-3 text-gray-200">
          Select a location on the map to analyze its feasibility for a new restaurant.
        </p>
      </header>

      <div className="flex-1 min-h-0">
        <GoogleMapComponent />
      </div>
    </main>
  );
}

