export function exportToCsv(data: any[], filename: string) {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((obj) => {
    return Object.values(obj)
      .map((val) => {
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",");
  });

  const csvContent = [headers, ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
