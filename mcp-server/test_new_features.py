#!/usr/bin/env python3
"""
测试新增的 Context Manager 功能
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from context_manager import ContextManager

# Initialize
DATA_DIR = '/Users/itsai/PersonalBusiness/context-manager/data'
manager = ContextManager(DATA_DIR)

def test_save_discussion():
    """测试保存讨论功能"""
    print("Testing save_discussion...")
    result = manager.save_discussion(
        project="test project",
        topic="新增 MCP Server 功能设计",
        summary="为 Context Manager MCP server 新增一套完整的讨论管理工具集",
        details="设计并实现了 save_discussion, save_decision, save_problem_solution 等工具",
        participants=["agent", "user"],
        tags=["discussion", "mcp-development"],
        related_files=[
            "/Users/itsai/PersonalBusiness/context-manager/mcp-server/server.py",
            "/Users/itsai/PersonalBusiness/context-manager/mcp-server/context_manager.py"
        ]
    )
    print(f"✓ save_discussion: {result}")
    return result

def test_save_decision():
    """测试保存决策功能"""
    print("\nTesting save_decision...")
    result = manager.save_decision(
        project="test project",
        title="使用混合方式组织讨论内容",
        context="需要一种灵活的方式来组织和分类保存的讨论内容",
        decision="同时使用 tags、自定义 type 和结构化 JSON 来组织内容",
        consequences="提供了最大的灵活性，可以通过多种方式搜索和过滤内容",
        alternatives=[
            "只使用 tags",
            "只使用自定义 type",
            "只使用结构化 JSON"
        ],
        tags=["decision", "architecture"]
    )
    print(f"✓ save_decision: {result}")
    return result

def test_save_problem_solution():
    """测试保存问题解决方案功能"""
    print("\nTesting save_problem_solution...")
    result = manager.save_problem_solution(
        project="test project",
        problem="MCP server 缺少专门的讨论管理工具",
        root_cause="原有的 create_context 功能太通用，不适合保存结构化的讨论内容",
        solution="创建专门的工具（save_discussion, save_decision 等）来处理不同类型的讨论",
        prevention="在设计 API 时考虑不同的使用场景和数据结构需求",
        tags=["problem-solution", "mcp-development"]
    )
    print(f"✓ save_problem_solution: {result}")
    return result

def test_save_api_design():
    """测试保存API设计功能"""
    print("\nTesting save_api_design...")
    result = manager.save_api_design(
        project="test project",
        name="save_discussion",
        description="保存讨论主题、摘要和详细内容，支持关联文件和contexts",
        parameters={
            "project": "项目名称（必需）",
            "topic": "讨论主题（必需）",
            "summary": "摘要（必需）",
            "details": "详细内容（可选）",
            "participants": "参与者列表（可选）",
            "tags": "标签（可选）",
            "related_files": "相关文件路径（可选）",
            "related_contexts": "相关context IDs（可选）",
            "links": "外部链接（可选）"
        },
        returns="{'success': True, 'contextId': <id>}",
        examples=[
            'manager.save_discussion(project="my-project", topic="API设计", summary="讨论了新的API接口")'
        ],
        tags=["api-design", "documentation"]
    )
    print(f"✓ save_api_design: {result}")
    return result

def test_batch_save():
    """测试批量保存功能"""
    print("\nTesting batch_save_items...")
    items = [
        {
            "content": "讨论要点1：使用 metadata 字段存储额外信息",
            "type": "text",
            "note": "讨论要点1",
            "tags": ["discussion"]
        },
        {
            "content": "讨论要点2：支持关联多个相关文件和contexts",
            "type": "text",
            "note": "讨论要点2",
            "tags": ["discussion"]
        },
        {
            "content": "讨论要点3：自动生成合适的 note 内容",
            "type": "text",
            "note": "讨论要点3",
            "tags": ["discussion"]
        }
    ]
    result = manager.batch_save_items(
        project="test project",
        items=items,
        tags=["batch-test", "discussion"]
    )
    print(f"✓ batch_save_items: {result}")
    return result

def test_update_context(context_id):
    """测试更新context功能"""
    print(f"\nTesting update_context for context_id={context_id}...")
    result = manager.update_context(
        context_id=context_id,
        tags=["discussion", "mcp-development", "updated"],
        metadata={"status": "completed", "version": "1.0"}
    )
    print(f"✓ update_context: {result}")
    return result

def test_search():
    """测试搜索功能"""
    print("\nTesting search with new types...")

    # Search for discussions
    results = manager.search_contexts(
        project="test project",
        type="discussion",
        limit=10
    )
    print(f"✓ Found {len(results)} discussion contexts")

    # Search for decisions
    results = manager.search_contexts(
        project="test project",
        type="decision",
        limit=10
    )
    print(f"✓ Found {len(results)} decision contexts")

    # Search by tag
    results = manager.search_contexts(
        project="test project",
        tags=["mcp-development"],
        limit=10
    )
    print(f"✓ Found {len(results)} contexts with tag 'mcp-development'")

def main():
    print("=" * 60)
    print("Context Manager - 新功能测试")
    print("=" * 60)

    try:
        # Test all new features
        discussion_result = test_save_discussion()
        decision_result = test_save_decision()
        problem_result = test_save_problem_solution()
        api_result = test_save_api_design()
        batch_result = test_batch_save()

        # Test update with the first created context
        if discussion_result.get('success'):
            context_id = discussion_result['contextId']
            test_update_context(context_id)

        # Test search
        test_search()

        print("\n" + "=" * 60)
        print("✅ 所有测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
