import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import styles from "./FavoriteStar.module.css";

type Props = {
  roadmapId: string;
  size?: "sm" | "md";
};

export const FavoriteStar = ({ roadmapId, size = "sm" }: Props) => {
  const { service } = useData();
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const isFav = service.isFavorite(currentUser.id, roadmapId);
  const toggle = () => {
    if (isFav) service.removeFavorite(currentUser.id, roadmapId);
    else service.addFavorite(currentUser.id, roadmapId);
  };
  return (
    <button
      type="button"
      className={`${styles.star} ${size === "md" ? styles.md : ""}`}
      onClick={toggle}
      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFav}
      title={isFav ? "Remove from favorites" : "Add to favorites"}
    >
      <span className={isFav ? styles.filled : styles.outline} aria-hidden="true">
        {isFav ? "★" : "☆"}
      </span>
    </button>
  );
};
