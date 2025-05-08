
function toggleCompleted(element, taskId) {
  const currValue = element.getAttribute("data-checked");
  element.setAttribute("data-checked", (+currValue + 1) % 2);
  webviewApi.postMessage({
    name: 'toggleCompleted',
    taskId,
  });
}

function toggleDueToday(taskId) {
  webviewApi.postMessage({
    name: 'toggleDueToday',
    taskId,
  });
}

function addTask(dueToday) {
  webviewApi.postMessage({
    dueToday
  });
}