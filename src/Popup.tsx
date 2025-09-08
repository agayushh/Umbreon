export default function Popup() {
  return (
    <div className="p-4 w-64">
      <h1 className="text-lg font-bold">AI Form Filler</h1>
      <button
        className="mt-4 w-full bg-blue-500 text-white p-2 rounded"
        onClick={() => alert("This will fill forms")}
      >
        Fill Form
      </button>
    </div>
  );
}
