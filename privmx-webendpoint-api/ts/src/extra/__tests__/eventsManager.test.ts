import {
    ThreadEventsManager
} from '../events';
import {
    MockThreadEventApi
} from './__mocks__/mockEventAPIs';
import {createTestSetup} from "./__mocks__/utils";

describe('Events Helpers', () => {
    let { q, manager } = createTestSetup();
    let mockEventsManager = new ThreadEventsManager(new MockThreadEventApi(q));
    manager.registerDispatcher(mockEventsManager);

    beforeEach(() => {
        let { q:_q, manager:_m } = createTestSetup();
        q = _q
        manager = _m
        mockEventsManager = new ThreadEventsManager(new MockThreadEventApi(q));
        manager.registerDispatcher(mockEventsManager);
    });

    it('should registered dispatchers', () => {
        expect(manager.dispatchers.length).toBe(1);
    });

    it('should call callback for matching event', async () => {
        const cb = jest.fn();
        await mockEventsManager.onThreadEvent({ event: 'threadStatsChanged', callback: cb });
        q.dispatchEvent({
            type: 'threadStatsChanged',
            data: {},
            channel: 'thread',
            connectionId: 1
        });

        //adding task on end of js event loop
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(cb).toHaveBeenCalled();
                resolve();
            }, 0);
        });
    });

    it('should receive multiple events', async () => {
        const cb = jest.fn();
        await mockEventsManager.onThreadEvent({ event: 'threadStatsChanged', callback: cb });
        q.dispatchEvent({
            type: 'threadStatsChanged',
            data: {},
            channel: 'thread',
            connectionId: 1
        });
        q.dispatchEvent({
            type: 'threadStatsChanged',
            data: {},
            channel: 'thread',
            connectionId: 1
        });
        //adding task on end of js event loop
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(cb).toHaveBeenCalledTimes(2);
                resolve();
            }, 0);
        });

        q.dispatchEvent({
            type: 'threadStatsChanged',
            data: {},
            channel: 'thread',
            connectionId: 1
        });
        //adding task on end of js event loop
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(cb).toHaveBeenCalledTimes(3);
                resolve();
            }, 0);
        });
    });
});



