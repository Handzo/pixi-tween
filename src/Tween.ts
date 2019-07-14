import * as PIXI from 'pixi.js';
import { Easing, Ease} from './Easing';
import TweenManager from './TweenManager';
import TweenPath from './TweenPath';
import * as cloneDeep from 'lodash/fp/cloneDeep';

export default class Tween extends PIXI.utils.EventEmitter {
    private _manager: TweenManager;
    private _chainTween: Tween;
    private _to:any;
    private _from:any;
    private _delayTime:number;
    private _elapsedTime:number;
    private _repeat:number;
    private _pingPong:boolean;

    active:boolean = false;
    time:number;
    easing: Ease;
    expire: boolean;
    repeat:number;
    delay:number;
    loop:boolean;
    pingPong:boolean;
    isStarted:boolean;
    isEnded:boolean;
    
    path:TweenPath;
    pathReverse:boolean;
    pathFrom:number;
    pathTo:number;

    constructor(
        public target: any,
        manager?: TweenManager
    ) {
        super();
        if(manager) {
            this.manager = manager;
        }

        this.clear();
    }

    chain(tween?: Tween) : Tween {
        if (!tween) {
            tween = new Tween(this.target);
        }

        this._chainTween = tween;
        return tween;
    }

    start() : Tween {
        this.active = true;
        return this;
    }

    stop() : Tween {
        this.active = false;
        this.emit('stop');
        return this;
    }

    to(data:any) : Tween {
        this._to = data;
        return this;
    }

    from(data:any) : Tween {
        this._from = data;
        return this;
    }

    remove() : Tween {
        if (!this.manager) {
            return this;
        }
        this.manager.removeTween(this);
        return this;
    }

    clear() {
        this.time = 0;
        this.active = false;
        this.easing = Easing.linear();
        this.expire = false;
        this.repeat = 0;
        this.loop = false;
        this.delay = 0;
        this.pingPong = false;
        this.isStarted = false;
        this.isEnded = false;

        this._to = null;
        this._from = null;
        this._delayTime = 0;
        this._elapsedTime = 0;
        this._repeat = 0;
        this._pingPong = false;

        this._chainTween = null;

        this.path = null;
        this.pathReverse = false;
        this.pathFrom = 0;
        this.pathTo = 0;
    }

    reset() : Tween {
        this._elapsedTime = 0;
        this._repeat = 0;
        this._delayTime = 0;
        this.isStarted = false;
        this.isEnded = false;

        if (this.pingPong && this._pingPong) {
            let _to = this._to;
            let _from = this._from;
            this._to = _from;
            this._from = _to;

            this._pingPong = false;
        }

        return this;
    }

    update(delta:number, deltaMS:number) {
        if (!this._canUpdate() && (this._to || this.path)) return;
        let _to, _from;
        if (this.delay > this._delayTime) {
            this._delayTime += deltaMS;
            return;
        }

        if (!this.isStarted) {
            this._parseData();
            this.isStarted = true;
            this.emit('start');
        }

        let time = (this.pingPong) ? this.time / 2 : this.time;

        if (time > this._elapsedTime) {
            let t = this._elapsedTime + deltaMS;
            let ended = (t >= time);

            this._elapsedTime = ended ? time : t;
            this._apply(time);

            let realElapsed = this._pingPong ? time + this._elapsedTime : this._elapsedTime;
            this.emit('update', realElapsed);

            if (ended) {
                if (this.pingPong && !this._pingPong) {
                    this._pingPong = true;
                    _to = this._to;
                    _from = this._from;
                    this._from = _to;
                    this._to = _from;

                    if (this.path) {
                        _to = this.pathTo;
                        _from = this.pathFrom;
                        this.pathTo = _from;
                        this.pathFrom = _to;
                    }

                    this.emit('pingpong');
                    this._elapsedTime = 0;
                    return;
                }

                if (this.loop || this.repeat > this._repeat) {
                    this._repeat++;
                    this.emit('repeat', this._repeat);
                    this._elapsedTime = 0;

                    if (this.pingPong && this._pingPong) {
                        _to = this._to;
                        _from = this._from;
                        this._to = _from;
                        this._from = _to;

                        if (this.path) {
                            _to = this.pathTo;
                            _from = this.pathFrom;
                            this.pathTo = _from;
                            this.pathFrom = _to;
                        }

                        this._pingPong = false;
                    }
                    return;
                }

                this.isEnded = true;
                this.active = false;
                this.emit('end');

                if (this._chainTween) {
                    this._chainTween.manager = this.manager;
                    this._chainTween.start();
                }
            }
            return;
        }
    }

    _parseData() {
        if (this.isStarted) return;
        if (!this._from) this._from = {};
        _parseRecursiveData(this._to, this._from, this.target);

        if (this.path) {
            let distance = this.path.totalDistance();
            if (this.pathReverse) {
                this.pathFrom = distance;
                this.pathTo = 0;
            } else {
                this.pathFrom = 0;
                this.pathTo = distance;
            }
        }
    }

    _apply(time) {
        _recursiveApplyTween(this._to, this._from, this.target, time, this._elapsedTime, this.easing);

        if (this.path) {
            let time = (this.pingPong) ? this.time / 2 : this.time;
            let b = this.pathFrom;
            let c = this.pathTo - this.pathFrom;
            let d = time;
            let t = this._elapsedTime / d;

            let distance = b + (c * this.easing(t));
            let pos = this.path.getPointAtDistance(distance);
            this.target.position.set(pos.x, pos.y);
        }
    }

    _canUpdate() : boolean {
        return (this.time && this.active && this.target);
    }

    get manager() : TweenManager {
        return this._manager;
    }

    set manager(m:TweenManager) {
        this._manager = m;
        this._manager.addTween(this);
    }
}

function _recursiveApplyTween(to:any, from:any, target:any, time:number, elapsed:number, easing:Ease) {
    for (let k in to) {
        if(_isObject(to[k])){
            _recursiveApplyTween(to[k], from[k], target[k], time, elapsed, easing);
            continue;
        }
        
        let b = from[k];
        let c = to[k] - from[k];
        let d = time;
        let t = elapsed / d;
        target[k] = b + (c * easing(t));
    }
}

function _parseRecursiveData(to:any, from:any, target:any) {
    for (let k in to) {
        if (from[k] !== 0 && !from[k]) {
            if (_isObject(target[k])) {
                from[k] = cloneDeep(target[k]);
                return _parseRecursiveData(to[k], from[k], target[k]);
            }

            from[k] = target[k];
        }
    }
}

function _isObject(obj:any) : boolean {
    return Object.prototype.toString.call(obj) === "[object Object]";
}
