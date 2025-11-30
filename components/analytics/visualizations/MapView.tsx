'use client';

interface MapViewProps {
  data: any[];
  title?: string;
}

export default function MapView({ data, title }: MapViewProps) {
  // Map view would typically integrate with a mapping library like Leaflet or Google Maps
  // For now, showing a placeholder with data table
  
  return (
    <div className="w-full h-64">
      {title && <h4 className="text-sm font-semibold mb-2">{title}</h4>}
      <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="mb-2">Map visualization</p>
          <p className="text-sm">Requires geographic data with coordinates</p>
          <p className="text-xs mt-2">Data points: {data.length}</p>
        </div>
      </div>
    </div>
  );
}

