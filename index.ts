import {
    ConnectableObservable,
    merge,
    noop,
    Observable,
    OperatorFunction,
    pipe,
    Subject,
    Subscription,
    UnaryFunction,
} from 'rxjs';
import { distinctUntilChanged, filter, map, mergeAll, publish, publishReplay, scan, shareReplay } from 'rxjs/operators';

// tslint:disable: rxjs-finnish

/** RxJS INTERNAL */
function pipeFromArray<T, R>(fns: UnaryFunction<T, R>[]): UnaryFunction<T, R> {
    if (!fns) {
        return noop as UnaryFunction<any, any>;
    }

    if (fns.length === 1) {
        return fns[0];
    }

    return function piped(input: T): R {
        return fns.reduce((prev: any, fn: UnaryFunction<T, R>) => fn(prev), input as any);
    };
}

export function select<T>(): UnaryFunction<T, T>;
export function select<T, A>(op: OperatorFunction<T, T>): UnaryFunction<T, A>;
export function select<T, A, B>(op1: OperatorFunction<T, A>, op2: OperatorFunction<A, B>): UnaryFunction<T, B>;
// tslint:disable-next-line:max-line-length
export function select<T, A, B, C>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
): UnaryFunction<T, C>;
// tslint:disable-next-line:max-line-length
export function select<T, A, B, C, D>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
): UnaryFunction<T, D>;
export function select<T>(...ops: OperatorFunction<T, any>[]) {
    return pipe(
        pipeFromArray(ops),
        filter(v => v !== undefined),
        distinctUntilChanged(),
        shareReplay(1),
    );
}

export class LocalState<T> implements OnDestroy {
    private readonly _subscription = new Subscription();
    private readonly _stateObservables = new Subject<Observable<Partial<T>>>();
    private readonly _stateSlices = new Subject<Partial<T> | ((previousState: Partial<T>) => Partial<T>)>();
    private readonly _effectSubject = new Subject<any>();

    private readonly stateAccumulator = (
        acc: T,
        command: Partial<T> | ((previousState: Partial<T>) => Partial<T>),
    ): T => {
        const slice = typeof command === 'function' ? command(acc) : command;
        return { ...acc, ...slice };
    };

    // tslint:disable-next-line:member-ordering
    private readonly _state$ = merge(this._stateObservables.pipe(mergeAll()), this._stateSlices).pipe(
        scan(this.stateAccumulator.bind(this), {} as T),
        publishReplay(1),
    );

    // tslint:disable-next-line:member-ordering
    constructor() {
        this._subscription.add((this._state$ as ConnectableObservable<T>).connect());
        this._subscription.add(
            (this._effectSubject.pipe(mergeAll(), publish()) as ConnectableObservable<any>).connect(),
        );
    }

    /**
     * setState(s: Partial<T>) => void
     *
     * @param s: Partial<T>
     *
     * @example
     * const ls = new LocalState<{test: string, bar: number}>();
     * // Error
     * // ls.setState({test: 7});
     * ls.setState({test: 'tau'});
     * // Error
     * // ls.setState({bar: 'tau'});
     * ls.setState({bar: 7});
     */
    public setState(s: Partial<T> | ((previousState: Partial<T>) => Partial<T>)): void {
        this._stateSlices.next(s);
    }

    /**
     * connectState(o: Observable<Partial<T>>) => void
     *
     * @param o: Observable<Partial<T>>
     *
     * @example
     * const ls = new LocalState<{test: string, bar: number}>();
     * // Error
     * // ls.connectState(of(7));
     * // ls.connectState(of('tau'));
     * ls.connectState(of());
     * // Error
     * // ls.connectState(of({test: 7}));
     * ls.connectState(of({test: 'tau'}));
     * // Error
     * // ls.connectState(of({bar: 'tau'}));
     * ls.connectState(of({bar: 7}));
     *
     */
    public connectState<A extends keyof T>(strOrObs: A | Observable<Partial<T>>, obs?: Observable<T[A]>): void {
        let _obs;
        if (typeof strOrObs === 'string') {
            const str: A = strOrObs;
            const o = obs;
            _obs = o.pipe(map(s => ({ [str]: s })));
        } else {
            const ob = strOrObs as Observable<Partial<T>>;
            _obs = ob;
        }
        this._stateObservables.next(_obs as Observable<Partial<T>> | Observable<T[A]>);
    }

    /**
     * connectEffect(o: Observable<any>) => void
     *
     * @param o: Observable<any>
     *
     * @example
     * const ls = new LocalState<{test: string, bar: number}>();
     * // Error
     * // ls.connectEffect();
     * ls.connectEffect(of());
     * ls.connectEffect(of().pipe(tap(n => console.log('side effect', n))));
     */
    public connectEffect(o: Observable<any>): void {
        this._effectSubject.next(o);
    }

    /**
     * select<R>(operator?: OperatorFunction<T, R>): Observable<T | R>
     *
     * @param operator?: OperatorFunction<T, R>
     *
     * @example
     * const ls = new LocalState<{test: string, bar: number}>();
     * ls.select();
     * // Error
     * // ls.select('foo');
     * ls.select('test');
     * // Error
     * // ls.select(of(7));
     * ls.select(mapTo(7));
     * // Error
     * // ls.select(map(s => s.foo));
     * ls.select(map(s => s.test));
     * // Error
     * // ls.select(pipe());
     * // ls.select(pipe(map(s => s.test), startWith(7)));
     * ls.select(pipe(map(s => s.test), startWith('unknown test value')));
     * @TODO consider state keys as string could be passed
     * // For state keys as string i.e. 'bar'
     * select<R, K extends keyof T>(operator?: K): Observable<T>;
     * if (typeof operator === 'string') {
     *  const key: string = operator;
     *  operators = pipe(map(s => operator ? s[key] : s));
     * }
     * @TODO consider ngrx selectors could be passed
     * // For project functions i.e. (s) => s.slice, (s) => s.slice * 2 or (s) => 2
     * select<R>(operator: (value: T, index?: number) => T | R, thisArg?: any): Observable<T | R>;
     * if (typeof operator === 'function') {
     *  const mapFn: (value: T, index: number) => R = operator ? operator : (value: T, index: number): R => value;
     *  operators = pipe(map(mapFn));
     * }
     */
    public select(): Observable<T>;
    public select<A = T>(op: OperatorFunction<T, A>): Observable<A>;
    public select<A = T, B = A>(op1: OperatorFunction<T, A>, op2: OperatorFunction<A, B>): Observable<B>;
    public select<A = T, B = A, C = B>(
        op1: OperatorFunction<T, A>,
        op2: OperatorFunction<A, B>,
        op3: OperatorFunction<B, C>,
    ): Observable<C>;
    public select<U extends keyof T>(path: U): Observable<T[U]>;
    public select(...opOrMapFn: OperatorFunction<T, any>[] | string[]): Observable<any> {
        if (!opOrMapFn || opOrMapFn.length === 0) {
            return this._state$.pipe(distinctUntilChanged(), shareReplay(1));
        } else if (!this.isOperateFnArray(opOrMapFn)) {
            const path = opOrMapFn[0];
            return this._state$.pipe(
                map((x: T) => (x as any)[path]),
                filter(v => v !== undefined),
                distinctUntilChanged(),
                shareReplay({ bufferSize: 1, refCount: true }),
            );
        } else {
            return this._state$.pipe(select(...(opOrMapFn as [])));
        }
    }

    private isOperateFnArray(op: OperatorFunction<T, any>[] | string[]): op is OperatorFunction<T, any>[] {
        return !(op.length === 1 && typeof op[0] === 'string');
    }

    /**
     * teardown(): void
     *
     * When called it teardown all internal logic
     * used to connect to the `OnDestroy` life-cycle hook of services, components, directives, pipes
     */
    public teardown(): void {
        this._subscription.unsubscribe();
    }

    /**
     * ngOnDestroy(): void
     *
     * When called it teardown all internal logic
     * used to connect to the `OnDestroy` life-cycle hook of services, components, directives, pipes
     */
    public ngOnDestroy(): void {
        this.teardown();
    }
}

// tslint:enable: rxjs-finnish
