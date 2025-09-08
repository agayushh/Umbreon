console.log("Content script loaded");

document
  .querySelectorAll<HTMLInputElement>(
    'input, textarea, select, input[type="text"], input[type="email"], input[type="url"], input[type= "number"]'
  )
  .forEach((input) => {
    if (input.type === "text") input.value = "Sample Text";
    if (input.type === "email") input.value = "ayush@gmail.com";
    if (input.type === "url") input.value = "https://example.com";
    if (input.type === "number") input.value = "12345";
  });
document
  .querySelectorAll<HTMLTextAreaElement>("textarea")
  .forEach((textarea) => {
    textarea.value = "Sample textarea content";
  });

document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
  if (select.options.length > 0) select.value = select.options[0].value;
});

document
  .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  .forEach((input) => {
    input.checked = true;
  });
