export function GISPage() {
  return (
    <div className="min-h-screen bg-[#fafbfc] pt-20 px-4 sm:px-8 py-8 lg:py-12 max-w-6xl mx-auto">
      <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
        <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-4">GIS Map</h1>
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <p className="text-sm text-slate-600">Mocked GIS data loaded</p>
          <div className="mt-4 h-48 rounded-xl bg-gradient-to-br from-lime-100 to-blue-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-slate-400">map</span>
          </div>
        </div>
      </div>
    </div>
  );
}
