import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-20 max-w-md p-8 text-center">
      <div className="kicker">404</div>
      <h1 className="mt-1 text-2xl font-bold">Кампания не найдена</h1>
      <p className="mt-2 text-sm text-muted">Возможно, она не открутилась в выбранном периоде.</p>
      <Link href="/" className="btn btn-dark mt-4">
        К списку кампаний
      </Link>
    </div>
  );
}
