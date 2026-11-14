// bridge/queue.js
export class TaskQueue {
  constructor() {
    this.tasks = [];
    this.processing = false;
  }

  add(task) {
    this.tasks.push(task);
    this.processQueue();
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;
    while (this.tasks.length > 0) {
      const currentTask = this.tasks.shift();
      try {
        await currentTask();
      } catch (err) {
        console.error("任务执行失败：", err);
      }
    }
    this.processing = false;
  }
}
