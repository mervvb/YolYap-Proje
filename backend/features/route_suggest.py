from typing import List
import math

def total_cost(order: List[int], durations: List[List[float]]) -> float:
    s = 0.0
    for i in range(len(order)-1):
        a, b = order[i], order[i+1]
        d = durations[a][b]
        if d is None or math.isinf(d) or math.isnan(d):
            return float("inf")
        s += d
    return s

def greedy_from(start: int, durations: List[List[float]]) -> List[int]:
    n = len(durations)
    visited = [False]*n
    order = [start]
    visited[start] = True
    while len(order) < n:
        last = order[-1]
        best, bestd = -1, float("inf")
        for j in range(n):
            if visited[j] or j == last: continue
            d = durations[last][j]
            if d is not None and d < bestd:
                best, bestd = j, d
        if best == -1: break
        visited[best] = True
        order.append(best)
    return order

def two_opt(order: List[int], durations: List[List[float]]) -> List[int]:
    if len(order) < 4: return order
    cur = order[:]
    improved = True
    def cost(o): return total_cost(o, durations)

    while improved:
        improved = False
        for i in range(1, len(cur)-2):
            for k in range(i+1, len(cur)-1):
                cand = cur[:i] + cur[i:k+1][::-1] + cur[k+1:]
                if cost(cand) < cost(cur):
                    cur = cand
                    improved = True
    return cur