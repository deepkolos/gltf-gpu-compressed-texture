export class WorkerPool {
  pool: number;
  quene: Array<{
    resolve: (e: any) => void;
    msg: any;
    transfer: Array<Transferable>;
  }>;
  workers: Array<Worker>;
  workersResolve: Array<(e: any) => void>;
  workerStatus: number;

  constructor(pool = 4) {
    this.pool = pool;
    this.quene = [];
    this.workers = [];
    this.workersResolve = [];
    this.workerStatus = 0;
    // 一般pool数量不会超过32个
  }

  initWorkers(creator: () => Worker) {
    for (let i = 0; i < this.pool; i++) {
      const worker = creator();
      worker.addEventListener('message', this.onMessage.bind(this, i));
      this.workers.push(worker);
    }
  }

  createWorkerSourceUrl(fn: Function) {
    const fnStr = fn.toString();
    return URL.createObjectURL(
      new Blob([
        fnStr.substring(fnStr.indexOf('{') + 1, fnStr.lastIndexOf('}')),
      ]),
    );
  }

  getIdleWorker() {
    for (let i = 0; i < this.pool; i++) {
      if (!(this.workerStatus & (1 << i))) return i;
    }
    return -1;
  }

  onMessage(workerId: number, msg: any) {
    const resolve = this.workersResolve[workerId];
    resolve && resolve(msg);

    if (this.quene.length) {
      const { resolve, msg, transfer } = this.quene.shift();
      this.workersResolve[workerId] = resolve;
      this.workers[workerId].postMessage(msg, transfer);
    } else {
      this.workerStatus ^= 1 << workerId;
    }
  }

  postMessage(msg: any, transfer?: Array<Transferable>): Promise<MessageEvent> {
    return new Promise(resolve => {
      const workerId = this.getIdleWorker();

      if (workerId !== -1) {
        this.workerStatus |= 1 << workerId;
        this.workersResolve[workerId] = resolve;
        this.workers[workerId].postMessage(msg, transfer);
      } else {
        this.quene.push({ resolve, msg, transfer });
      }
    });
  }

  dispose() {
    this.workers.forEach(worker => worker.terminate());
    this.workersResolve.length = 0;
    this.workers.length = 0;
    this.quene.length = 0;
    this.workerStatus = 0;
  }
}
