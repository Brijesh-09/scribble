export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "nextjs-backend",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}