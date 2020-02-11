import { produce } from 'immer';
import { marbles } from 'rxjs-marbles/jest';
import { map } from 'rxjs/operators';

import { LocalState } from './index';

interface TestState {
    test: string;
    bar: number;
}

interface ArrayState {
    items: number[];
}

// tslint:disable: no-duplicate-string
describe('LocalState', () => {
    it('should create new instance', () => {
        const state = new LocalState<TestState>();

        expect(state).toBeDefined();
    });

    describe('select', () => {
        it(
            'should return empty state after init',
            marbles(m => {
                const state = new LocalState<TestState>();
                m.expect(state.select()).toBeObservable('');
            }),
        );

        it(
            'should return initial state',
            marbles(m => {
                const state = new LocalState<TestState>();
                const initialState: TestState = { test: 'test', bar: 42 };

                state.setState(initialState);

                m.expect(state.select()).toBeObservable('s', { s: initialState });
            }),
        );

        describe('slice by key', () => {
            it(
                'should return empty state after init',
                marbles(m => {
                    const state = new LocalState<TestState>();
                    m.expect(state.select('bar')).toBeObservable('');
                }),
            );

            it(
                'should return initial state',
                marbles(m => {
                    const state = new LocalState<TestState>();

                    state.setState({ bar: 42 });

                    m.expect(state.select('bar')).toBeObservable('s', { s: 42 });
                }),
            );
        });

        describe('slice by map function', () => {
            it(
                'should return empty state after init',
                marbles(m => {
                    const state = new LocalState<TestState>();
                    m.expect(state.select(map(s => s.bar))).toBeObservable('');
                }),
            );

            it(
                'should return initial state',
                marbles(m => {
                    const state = new LocalState<TestState>();

                    state.setState({ bar: 42 });

                    m.expect(state.select(map(s => s.bar))).toBeObservable('s', { s: 42 });
                }),
            );
        });
    });

    describe('setState', () => {
        describe('with state slice', () => {
            it(
                'should override previous state slices',
                marbles(m => {
                    const state = new LocalState<TestState>();
                    const initialState: TestState = { test: 'test', bar: 42 };

                    state.setState(initialState);
                    state.setState({ test: 'test2' });

                    m.expect(state.select()).toBeObservable('s', { s: { test: 'test2', bar: 42 } });
                }),
            );

            it(
                'should add non-existing slices',
                marbles(m => {
                    const state = new LocalState<TestState>();

                    state.setState({ bar: 42 });
                    state.setState({ test: 'test2' });

                    m.expect(state.select()).toBeObservable('s', { s: { test: 'test2', bar: 42 } });
                }),
            );
        });

        describe('with state operator', () => {
            it(
                'should override previous state slices',
                marbles(m => {
                    const state = new LocalState<TestState>();
                    const initialState: TestState = { test: 'test', bar: 42 };

                    state.setState(initialState);
                    state.setState(_ => ({ test: 'test2' }));

                    m.expect(state.select()).toBeObservable('s', { s: { test: 'test2', bar: 42 } });
                }),
            );

            it(
                'should add non-existing slices',
                marbles(m => {
                    const state = new LocalState<TestState>();

                    state.setState({ bar: 42 });
                    state.setState(_ => ({ test: 'test2' }));

                    m.expect(state.select()).toBeObservable('s', { s: { test: 'test2', bar: 42 } });
                }),
            );

            it(
                'should provide previous state',
                marbles(m => {
                    const state = new LocalState<TestState>();

                    state.setState({ bar: 42 });
                    state.setState(s => ({ bar: s.bar * 2 }));

                    m.expect(state.select('bar')).toBeObservable('s', { s: 42 * 2 });
                }),
            );
        });

        describe('with immerjs', () => {
            it(
                'should alter state in immutable way',
                marbles(m => {
                    const state = new LocalState<ArrayState>();

                    const initalState = { items: [1] };
                    state.setState(initalState);
                    state.setState(
                        produce(s => {
                            s.items.push(2);
                        }),
                    );

                    m.expect(state.select(map(s => s.items))).toBeObservable('s', { s: [1, 2] });
                    expect(initalState.items).toEqual([1]);
                }),
            );
        });
    });
});
