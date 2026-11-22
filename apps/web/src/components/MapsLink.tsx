export function MapsLink({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <a
      href={`https://www.google.com/maps?q=${latitude},${longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-700 underline decoration-dotted"
    >
      Lihat di Google Maps
    </a>
  );
}
