"""Deterministic local simulator. There is deliberately no HTTP/model SDK dependency."""
from __future__ import annotations


class StubGateway:
    alias = "stub-v1"
    simulated = True
    external_calls = 0

    def propose(self, visit, actor_id):
        """Copy explicit structured commitments; do not infer dates, people or facts."""
        follow_up = visit.get("followUp") or {}
        missing = [k for k in ("title", "ownerId", "dueDate") if not follow_up.get(k)]
        if missing:
            return {"actions": [], "needsClarification": missing,
                    "summary": "明确承诺缺少必要字段，请补充后再生成提案。"}
        if follow_up["ownerId"] != actor_id:
            return {"actions": [], "needsClarification": ["ownerId"],
                    "summary": "当前模拟器仅为本人内部任务生成建议，请由原负责人处理或用传统表单。"}
        return {"actions": [{"type": "task.create", "title": follow_up["title"],
                             "ownerId": actor_id, "dueDate": follow_up["dueDate"]}],
                "needsClarification": [],
                "summary": "规则模拟：读取已填写的明确后续事项，复制为待确认的内部任务；未理解自由文本。"}
